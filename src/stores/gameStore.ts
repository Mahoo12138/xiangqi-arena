import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Game } from '../engine/game'
import type { Board, PlayerConfig, Pos, Side } from '../types'
import { buildPrompt } from '../engine/format'
import { extractMove, streamChat, TransientError } from '../api/openai'
import { opposite } from '../engine/board'

const STORAGE_KEY = 'xiangqi-arena:game:v1'
const MAX_TRANSIENT = 3 // 网络/超时类瞬态重试上限
const MAX_INVALID = 3 // 非法走法重试上限
const MAX_ATTEMPTS = 6 // 总尝试兜底

// 单次请求总时长：随棋局深入自适应延长（后期每步推理久），可用环境变量覆盖
const TOTAL_BASE = 600_000 // 开局基准 10 分钟
const TOTAL_STEP = 10_000 // 每走一步 +10s
const TOTAL_MAX = 1_800_000 // 上限 30 分钟
const ENV_TOTAL = Number(import.meta.env.VITE_LLM_TOTAL_TIMEOUT_MS)
function totalTimeoutFor(moveCount: number): number {
  if (Number.isFinite(ENV_TOTAL) && ENV_TOTAL > 0) return ENV_TOTAL
  return Math.min(TOTAL_MAX, TOTAL_BASE + moveCount * TOTAL_STEP)
}

export interface MatchConfig {
  red: PlayerConfig
  black: PlayerConfig
}

// 从环境变量 VITE_LLM_MODELS（逗号分隔）解析可用模型列表
export function availableModels(): string[] {
  const raw = import.meta.env.VITE_LLM_MODELS || ''
  const list = raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length
    ? list
    : ['deepseek-v4-flash-0731', 'kimi/kimi-k3', 'qwen3.8-max', 'glm-5.2', 'MiniMax/MiniMax-M3']
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// 指数退避 + 抖动
function backoff(n: number) {
  return 1000 * Math.pow(2, n - 1) + Math.random() * 250
}

// 轮询等待条件成立（超时则直接返回）
function waitFor(cond: () => boolean, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const start = Date.now()
    const t = setInterval(() => {
      if (cond() || Date.now() - start > timeoutMs) {
        clearInterval(t)
        resolve()
      }
    }, 50)
  })
}

export const useGameStore = defineStore('game', () => {
  const models = ref<string[]>(availableModels())
  const defaultModel = models.value[0] || 'deepseek-v4-flash-0731'

  const makeConfig = (): MatchConfig => ({
    red: { side: 'red', isHuman: false, model: defaultModel, name: '红方' },
    black: { side: 'black', isHuman: false, model: defaultModel, name: '黑方' },
  })

  const game = ref<Game>(new Game())
  const board = ref<Board>(game.value.board)
  const config = ref<MatchConfig>(makeConfig())

  const playing = ref(false)
  const thinking = ref<Side | null>(null)
  const liveReasoning = ref('')
  const liveTokens = ref(0)
  const liveMs = ref(0)
  const error = ref<string | null>(null)
  const busy = ref(false)

  let timer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  // 当前在途请求的中止函数 + 手动干预标记
  let currentAborter: (() => void) | null = null
  let manualAbort = false

  const turn = computed(() => game.value.turn)
  const result = computed(() => game.value.result)
  const records = computed(() => game.value.moveHistory)
  const moveCount = computed(() => game.value.moveCount)

  // 是否有未完成的对局（用于「继续上次对局」入口）
  const hasResumable = computed(() => moveCount.value > 0 && !result.value)

  function currentPlayer(side: Side): PlayerConfig {
    return side === 'red' ? config.value.red : config.value.black
  }

  function syncBoard() {
    board.value = game.value.board.map((row) => row.slice())
  }

  /* ---------- 持久化 ---------- */

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          config: config.value,
          board: game.value.board,
          turn: game.value.turn,
          result: game.value.result,
          moves: game.value.moveHistory,
          playing: playing.value,
        }),
      )
    } catch {
      /* 配额/隐私模式等，忽略 */
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.version !== 1) return
      const g = new Game()
      g.board = d.board
      g.turn = d.turn
      g.result = d.result
      g.moveHistory = d.moves
      game.value = g
      syncBoard()
      if (d.config) {
        config.value = {
          red: { ...makeConfig().red, ...d.config.red, side: 'red' },
          black: { ...makeConfig().black, ...d.config.black, side: 'black' },
        }
      }
      // 还原局但默认不自动续走，避免刷新即消耗 Token
      playing.value = false
    } catch {
      clearState()
    }
  }

  function clearState() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  /* ---------- 生命周期 ---------- */

  function startGame() {
    stopTimer()
    game.value = new Game()
    syncBoard()
    playing.value = true
    error.value = null
    clearState()
    saveState()
    kick()
  }

  function updateConfig(cfg: MatchConfig) {
    config.value = cfg
    saveState()
  }

  // 弃局：清空内存与持久化，恢复为未开局状态（不自动走棋）
  function discard() {
    stopTurn() // 先中止在途请求，避免卡死流继续空耗
    stopTimer()
    game.value = new Game()
    syncBoard()
    playing.value = false
    error.value = null
    clearState()
  }

  // 中止当前在途的 AI 请求（模型思维链卡死时干预）
  function stopTurn() {
    manualAbort = true
    currentAborter?.()
  }

  // 中止并立即重试当前行动方的一步
  async function retryTurn() {
    stopTurn()
    await waitFor(() => !busy.value, 3000)
    if (result.value) {
      playing.value = false
      return
    }
    const side = turn.value
    if (currentPlayer(side).isHuman) return
    playing.value = true
    kick()
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function startThinking(side: Side) {
    thinking.value = side
    liveReasoning.value = ''
    liveTokens.value = 0
    liveMs.value = 0
    startedAt = Date.now()
    stopTimer()
    timer = setInterval(() => {
      liveMs.value = Date.now() - startedAt
    }, 100)
  }

  function endThinking() {
    stopTimer()
    thinking.value = null
  }

  // 应用一步走法并推进
  function applyMove(move: { from: Pos; to: Pos }, meta: { cn: string; wxf: string; thinkMs: number; tokens: number; reasoning: string; error?: string }) {
    const piece = game.value.board[move.from.rank][move.from.file]
    if (!piece) return false
    const legal = game.value.tryMove({ from: move.from, to: move.to, piece, captured: null })
    if (!legal) return false
    const rec = game.value.moveHistory[game.value.moveHistory.length - 1]
    rec.thinkMs = meta.thinkMs
    rec.tokens = meta.tokens
    rec.reasoning = meta.reasoning
    rec.error = meta.error
    syncBoard()
    saveState()
    return true
  }

  // 人类走子
  function humanMove(from: Pos, to: Pos): boolean {
    if (result.value) return false
    if (thinking.value) return false
    const side = turn.value
    if (currentPlayer(side).isHuman === false) return false
    const ok = applyMove({ from, to }, { cn: '', wxf: '', thinkMs: 0, tokens: 0, reasoning: '' })
    if (ok) kick()
    return ok
  }

  // 触发下一回合（若轮到 AI 且对局进行中）
  function kick() {
    if (result.value) {
      playing.value = false
      return
    }
    const side = turn.value
    if (currentPlayer(side).isHuman) return
    if (playing.value) void aiTurn(side)
  }

  // 暂停
  function pause() {
    playing.value = false
  }

  // 继续
  function resume() {
    playing.value = true
    kick()
  }

  // 单步（走一步 AI）
  function step() {
    if (result.value) return
    const side = turn.value
    if (currentPlayer(side).isHuman) return
    playing.value = true
    void aiTurn(side)
  }

  async function aiTurn(side: Side) {
    if (busy.value || result.value) return
    if (turn.value !== side) return
    manualAbort = false
    busy.value = true
    startThinking(side)
    error.value = null

    const cfg = currentPlayer(side)
    let finalMove: { from: Pos; to: Pos } | null = null
    let finalReasoning = ''
    let finalTokens = 0
    let finalError: string | undefined
    let lastInvalidReason: string | undefined // 仅用于提示模型的非法走法反馈
    let transientCount = 0
    let invalidCount = 0
    let stopped = false // 用户手动中止

    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !finalMove; attempt++) {
        const prompt = buildPrompt(game.value.board, side, game.value.moveHistory, lastInvalidReason)
        const messages = [
          { role: 'system', content: 'You are a Chinese Chess (Xiangqi) AI player. Output only a move.' },
          { role: 'user', content: prompt },
        ]

        const ac = new AbortController()
        currentAborter = () => ac.abort()
        let res
        try {
          res = await streamChat(cfg.model, messages, {
            onReasoning: (t) => (liveReasoning.value = t),
            onContent: () => {},
            onUsage: (u) => {
              liveTokens.value = u.completionTokens
            },
          }, { dataTimeoutMs: 60_000, totalTimeoutMs: totalTimeoutFor(game.value.moveCount), signal: ac.signal })
        } catch (e) {
          currentAborter = null
          if (manualAbort) {
            manualAbort = false
            stopped = true
            break
          }
          if (e instanceof TransientError && transientCount < MAX_TRANSIENT) {
            transientCount++
            finalError = `${e.message}（第 ${transientCount} 次重试）`
            error.value = finalError
            await sleep(backoff(transientCount))
            continue
          }
          throw e
        }
        currentAborter = null

        finalReasoning = res.reasoning
        finalTokens = res.completionTokens
        liveTokens.value = res.completionTokens

        const moveText = extractMove(res.content)
        if (!moveText) {
          invalidCount++
          lastInvalidReason = `无法从回答中解析出走法坐标。回答: "${res.content.slice(0, 100)}"`
          if (invalidCount >= MAX_INVALID) throw new Error(lastInvalidReason)
          finalError = lastInvalidReason
          continue
        }
        const legal = game.value.findLegalByText(moveText)
        if (!legal) {
          invalidCount++
          lastInvalidReason = `走法 "${moveText}" 不是合法走法`
          if (invalidCount >= MAX_INVALID) throw new Error(lastInvalidReason)
          finalError = lastInvalidReason
          continue
        }
        finalMove = { from: legal.from, to: legal.to }
      }

      if (finalMove) {
        applyMove(finalMove, {
          cn: '',
          wxf: '',
          thinkMs: liveMs.value,
          tokens: finalTokens,
          reasoning: finalReasoning,
          error: finalError,
        })
      } else if (!stopped) {
        throw new Error(finalError || 'AI 未能给出合法走法')
      }
    } catch (e) {
      if (!stopped) error.value = String(e)
    } finally {
      currentAborter = null
      endThinking()
      busy.value = false
    }

    // 推进下一回合：仅当成功走子才推进
    if (finalMove) {
      if (result.value) {
        playing.value = false
      } else if (playing.value) {
        const next = opposite(side)
        if (!currentPlayer(next).isHuman) void aiTurn(next)
      }
    }
  }

  /* ---------- 标签页后台 / 卸载 ---------- */

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const side = turn.value
      if (playing.value && !busy.value && !thinking.value && !result.value && !currentPlayer(side).isHuman) {
        void aiTurn(side)
      }
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', saveState)
  }

  // 启动时还原上次对局
  loadState()

  return {
    game,
    board,
    config,
    models,
    playing,
    thinking,
    liveReasoning,
    liveTokens,
    liveMs,
    error,
    turn,
    result,
    records,
    moveCount,
    hasResumable,
    currentPlayer,
    startGame,
    updateConfig,
    discard,
    stopTurn,
    retryTurn,
    humanMove,
    pause,
    resume,
    step,
    kick,
  }
})