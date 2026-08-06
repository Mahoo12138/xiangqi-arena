import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Game } from '../engine/game'
import type { Board, PlayerConfig, Pos, Side } from '../types'
import { buildPrompt } from '../engine/format'
import { extractMove, streamChat } from '../api/openai'
import { opposite } from '../engine/board'

const MAX_RETRY = 3

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

export const useGameStore = defineStore('game', () => {
  const models = ref<string[]>(availableModels())
  const defaultModel = models.value[0] || 'deepseek-v4-flash-0731'
  const game = ref<Game>(new Game())
  const board = ref<Board>(game.value.board)
  const config = ref<MatchConfig>({
    red: { side: 'red', isHuman: false, model: defaultModel, name: '红方' },
    black: { side: 'black', isHuman: false, model: defaultModel, name: '黑方' },
  })

  const playing = ref(false)
  const thinking = ref<Side | null>(null)
  const liveReasoning = ref('')
  const liveTokens = ref(0)
  const liveMs = ref(0)
  const error = ref<string | null>(null)
  const busy = ref(false)

  let timer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  const turn = computed(() => game.value.turn)
  const result = computed(() => game.value.result)
  const records = computed(() => game.value.moveHistory)
  const moveCount = computed(() => game.value.moveCount)

  function currentPlayer(side: Side): PlayerConfig {
    return side === 'red' ? config.value.red : config.value.black
  }

  function startGame() {
    stopTimer()
    game.value = new Game()
    syncBoard()
    playing.value = true
    error.value = null
    kick()
  }

  function syncBoard() {
    board.value = game.value.board.map((row) => row.slice())
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
    busy.value = true
    startThinking(side)
    error.value = null

    const cfg = currentPlayer(side)
    let finalMove: { from: Pos; to: Pos } | null = null
    let finalReasoning = ''
    let finalTokens = 0
    let finalError: string | undefined

    try {
      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        const prompt = buildPrompt(game.value.board, side, game.value.moveHistory, finalError)
        const messages = [
          { role: 'system', content: 'You are a Chinese Chess (Xiangqi) AI player. Output only a move.' },
          { role: 'user', content: prompt },
        ]

        const res = await streamChat(cfg.model, messages, {
          onReasoning: (t) => (liveReasoning.value = t),
          onContent: () => {
            // content 不用于实时界面，仅累计
          },
          onUsage: (u) => {
            liveTokens.value = u.completionTokens
          },
        })

        finalReasoning = res.reasoning
        finalTokens = res.completionTokens
        liveTokens.value = res.completionTokens

        const moveText = extractMove(res.content)
        if (!moveText) {
          finalError = `无法从回答中解析出走法坐标。回答: "${res.content.slice(0, 120)}"`
          continue
        }
        const legal = game.value.findLegalByText(moveText)
        if (!legal) {
          finalError = `走法 "${moveText}" 不是合法走法`
          continue
        }
        finalMove = { from: legal.from, to: legal.to }
        break
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
      } else {
        throw new Error(finalError || 'AI 未能给出合法走法')
      }
    } catch (e) {
      error.value = String(e)
    } finally {
      endThinking()
      busy.value = false
    }

    // 推进到下一回合
    if (result.value) {
      playing.value = false
    } else if (playing.value) {
      const next = opposite(side)
      if (!currentPlayer(next).isHuman) {
        // 下一回合也是 AI，继续
        void aiTurn(next)
      }
    }
  }

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
    currentPlayer,
    startGame,
    humanMove,
    pause,
    resume,
    step,
    kick,
  }
})