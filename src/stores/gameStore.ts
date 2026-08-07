import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Game } from '../engine/game'
import type { Board, GameDoc, GameStatusFlag, GameSummary, MatchConfig, PlayerConfig, Pos, Side } from '../types'
import { buildPrompt, SYSTEM_PROMPT } from '../engine/format'
import { extractMoveIndex, streamChat, TransientError } from '../api/openai'
import { opposite } from '../engine/board'
import { deleteGame as deleteGameDb, getAllGames, getGame, putGame } from '../db/indexeddb'

const MAX_TRANSIENT = 3 // 网络/超时类瞬态重试上限
const MAX_INVALID = 3 // 非法走法重试上限
const MAX_ATTEMPTS = 6 // 总尝试兜底
const LEASE_MS = 30_000 // 标签页占用租约时长；过期后其它标签页可接管

// 每标签页独立的当前对局指针与占用标记（sessionStorage，非 localStorage，天然每标签页一份）
const ACTIVE_KEY = 'xiangqi-arena:active'
const TAB_KEY = 'xiangqi-arena:tab'

function readActiveGameId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}
function writeActiveGameId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(ACTIVE_KEY, id)
    else sessionStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* ignore */
  }
}
function readTabId(): string {
  try {
    let id = sessionStorage.getItem(TAB_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(TAB_KEY, id)
    }
    return id
  } catch {
    return `tab-${Date.now()}`
  }
}

// 单次请求总时长：随棋局深入自适应延长（后期每步推理久），可用环境变量覆盖
const TOTAL_BASE = 600_000 // 开局基准 10 分钟
const TOTAL_STEP = 10_000 // 每走一步 +10s
const TOTAL_MAX = 1_800_000 // 上限 30 分钟
const ENV_TOTAL = Number(import.meta.env.VITE_LLM_TOTAL_TIMEOUT_MS)
function totalTimeoutFor(moveCount: number): number {
  if (Number.isFinite(ENV_TOTAL) && ENV_TOTAL > 0) return ENV_TOTAL
  return Math.min(TOTAL_MAX, TOTAL_BASE + moveCount * TOTAL_STEP)
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

function cloneConfig(cfg: MatchConfig): MatchConfig {
  return JSON.parse(JSON.stringify(cfg))
}

function toSummary(doc: GameDoc): GameSummary {
  return {
    id: doc.id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    status: doc.status,
    redName: doc.config.red.name,
    redModel: doc.config.red.model,
    blackName: doc.config.black.name,
    blackModel: doc.config.black.model,
    moveCount: doc.moves.length,
    result: doc.result,
    tabClaim: doc.tabClaim,
    leasUntil: doc.leasUntil,
  }
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

  // 多棋局注册表（IndexedDB 摘要）
  const games = ref<GameSummary[]>([])
  const activeGameId = ref<string | null>(null)
  const tabId = readTabId()
  let currentCreatedAt = Date.now()

  let timer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  // 当前在途请求的中止函数 + 手动干预标记
  let currentAborter: (() => void) | null = null
  let manualAbort = false

  // 对局代次：切换/重开时递增，使旧 AI 请求的响应作废
  let gameEpoch = 0
  // 当前在途 AI 回合的 Promise，供重试/切换等待其结束
  let activeTurn: Promise<void> | null = null

  // 使当前对局失效：作废在途请求，防止旧响应落到新棋盘
  function invalidateGame() {
    gameEpoch++
    currentAborter?.()
    currentAborter = null
  }

  const turn = computed(() => game.value.turn)
  const result = computed(() => game.value.result)
  const records = computed(() => game.value.moveHistory)
  const moveCount = computed(() => game.value.moveCount)

  // 当前局已有走子且未结束（用于首页「继续当前对局」入口）
  const hasResumable = computed(() => moveCount.value > 0 && !result.value)

  function currentPlayer(side: Side): PlayerConfig {
    return side === 'red' ? config.value.red : config.value.black
  }

  function syncBoard() {
    board.value = game.value.board.map((row) => row.slice())
  }

  /* ---------- 持久化（IndexedDB 多局） ---------- */

  async function refreshList() {
    try {
      games.value = (await getAllGames()).map(toSummary)
    } catch {
      /* IDB 不可用（隐私模式等），保持空列表 */
    }
  }

  // 是否被其它标签页占用（租约未过期）
  function claimedByOther(doc: GameDoc | undefined): boolean {
    return !!doc?.tabClaim && doc.tabClaim !== tabId && (doc.leasUntil ?? 0) > Date.now()
  }

  // 把当前内存对局持久化。仅在播放中才写入本标签页占用；非播放时不覆盖其它标签页的占用。
  async function saveCurrent(status: GameStatusFlag) {
    const id = activeGameId.value
    if (!id) return
    let tabClaim: string | undefined
    let leasUntil: number | undefined
    if (playing.value) {
      tabClaim = tabId
      leasUntil = Date.now() + LEASE_MS
    } else {
      const existing = await getGame(id)
      if (existing?.tabClaim && existing.tabClaim !== tabId) {
        tabClaim = existing.tabClaim
        leasUntil = existing.leasUntil
      }
    }
    const doc: GameDoc = {
      id,
      createdAt: currentCreatedAt,
      updatedAt: Date.now(),
      status,
      config: config.value,
      board: game.value.board,
      turn: game.value.turn,
      result: game.value.result,
      moves: game.value.moveHistory,
      tabClaim,
      leasUntil,
    }
    try {
      await putGame(doc)
      await refreshList()
    } catch {
      /* IDB 不可用，忽略 */
    }
  }

  async function loadGames() {
    await refreshList()
  }

  // 载入一个对局为当前局。autoplay 仅决定 playing 初值，不在此处直接 kick。
  function loadDocIntoActive(doc: GameDoc, autoplay: boolean) {
    invalidateGame()
    stopTimer()
    const g = new Game()
    g.board = doc.board
    g.turn = doc.turn
    g.result = doc.result
    g.moveHistory = doc.moves
    game.value = g
    syncBoard()
    config.value = cloneConfig(doc.config)
    currentCreatedAt = doc.createdAt
    activeGameId.value = doc.id
    writeActiveGameId(doc.id)
    playing.value = autoplay
    error.value = null
  }

  /* ---------- 生命周期 ---------- */

  // 用配置创建一局并自动开局
  async function createGame(cfg: MatchConfig) {
    invalidateGame()
    stopTimer()
    const id = crypto.randomUUID()
    currentCreatedAt = Date.now()
    config.value = cloneConfig(cfg)
    game.value = new Game()
    syncBoard()
    activeGameId.value = id
    writeActiveGameId(id)
    playing.value = true
    error.value = null
    await saveCurrent('active')
    await refreshList()
    kick()
  }

  // 载入一局（只查看，不自动走子）
  async function viewGame(id: string): Promise<boolean> {
    const doc = await getGame(id)
    if (!doc) return false
    loadDocIntoActive(doc, false)
    await refreshList()
    return true
  }

  // 载入一局并恢复（不自动播放，避免刷新即烧 Token）
  async function resumeGame(id: string): Promise<boolean> {
    if (claimedByOther(await getGame(id))) {
      error.value = '该对局正在另一个标签页中运行，无法在此续走'
      return false
    }
    const doc = await getGame(id)
    if (!doc) return false
    loadDocIntoActive(doc, false)
    await saveCurrent(doc.status)
    return true
  }

  // 载入一局并立即续走（历史页「续走」）
  async function continueGame(id: string): Promise<boolean> {
    if (claimedByOther(await getGame(id))) {
      error.value = '该对局正在另一个标签页中运行，无法在此续走'
      return false
    }
    const doc = await getGame(id)
    if (!doc) return false
    loadDocIntoActive(doc, true)
    await saveCurrent(doc.status)
    await refreshList()
    kick()
    return true
  }

  // 弃局：保存当前局为已放弃，并清空当前局
  async function abandonCurrent() {
    invalidateGame()
    stopTimer()
    playing.value = false
    if (activeGameId.value) await saveCurrent('abandoned')
    activeGameId.value = null
    writeActiveGameId(null)
    game.value = new Game()
    syncBoard()
    error.value = null
    await refreshList()
  }

  // 删除一局（若为当前局则一并清空）
  async function deleteGame(id: string) {
    if (activeGameId.value === id) {
      invalidateGame()
      stopTimer()
      playing.value = false
      activeGameId.value = null
      writeActiveGameId(null)
      game.value = new Game()
      syncBoard()
    }
    try {
      await deleteGameDb(id)
    } catch {
      /* ignore */
    }
    await refreshList()
  }

  // 中止当前在途的 AI 请求（模型思维链卡死时干预）
  function stopTurn() {
    manualAbort = true
    currentAborter?.()
  }

  // 中止在途请求并暂停对局（离开对局页时调用，避免后台继续烧 Token）
  function abortAndPause() {
    invalidateGame()
    playing.value = false
  }

  // 中止并立即重试当前行动方的一步：等待旧任务真正结束后再启动新任务
  async function retryTurn() {
    currentAborter?.()
    manualAbort = true
    await activeTurn
    manualAbort = false
    if (result.value) {
      playing.value = false
      return
    }
    const side = turn.value
    if (currentPlayer(side).isHuman) return
    playing.value = true
    activeTurn = aiTurn(side, { continueAfterMove: true })
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
    const legal = game.value.tryMove(move.from, move.to)
    if (!legal) return false
    const rec = game.value.moveHistory[game.value.moveHistory.length - 1]
    rec.thinkMs = meta.thinkMs
    rec.tokens = meta.tokens
    rec.reasoning = meta.reasoning
    rec.error = meta.error
    syncBoard()
    void saveCurrent('active')
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
    if (playing.value) activeTurn = aiTurn(side, { continueAfterMove: true })
  }

  // 暂停
  function pause() {
    playing.value = false
  }

  // 继续（开始播放前校验占用，避免两标签页同写一局）
  async function resume() {
    if (result.value) return
    if (activeGameId.value && claimedByOther(await getGame(activeGameId.value))) {
      error.value = '该对局正在另一个标签页中运行，无法在此续走'
      return
    }
    playing.value = true
    void saveCurrent('active')
    kick()
  }

  // 单步（只走一步 AI），不进入连续对弈
  async function step() {
    if (result.value) return
    if (activeGameId.value && claimedByOther(await getGame(activeGameId.value))) {
      error.value = '该对局正在另一个标签页中运行，无法在此续走'
      return
    }
    const side = turn.value
    if (currentPlayer(side).isHuman) return
    playing.value = false
    activeTurn = aiTurn(side, { continueAfterMove: false })
  }

  async function aiTurn(side: Side, options: { continueAfterMove: boolean }): Promise<void> {
    const epoch = gameEpoch
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
    let stopped = false // 用户手动中止或对局已失效

    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !finalMove; attempt++) {
        if (epoch !== gameEpoch) {
          stopped = true
          break
        }
        const legalMoves = game.value.legalMoveList
        const prompt = buildPrompt(game.value.board, side, game.value.moveHistory, legalMoves, lastInvalidReason)
        const messages = [
          { role: 'system', content: SYSTEM_PROMPT },
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
          if (epoch !== gameEpoch) {
            stopped = true
            break
          }
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
        if (epoch !== gameEpoch) {
          stopped = true
          break
        }

        finalReasoning = res.reasoning
        finalTokens = res.completionTokens
        liveTokens.value = res.completionTokens

        const moveIndex = extractMoveIndex(res.content)
        if (moveIndex === null) {
          invalidCount++
          lastInvalidReason = `Could not parse a move index from your reply: "${res.content.slice(0, 100)}"`
          if (invalidCount >= MAX_INVALID) throw new Error(lastInvalidReason)
          finalError = lastInvalidReason
          continue
        }
        const legal = legalMoves[moveIndex]
        if (!legal) {
          invalidCount++
          lastInvalidReason = `Move index ${moveIndex} is outside the legal move list`
          if (invalidCount >= MAX_INVALID) throw new Error(lastInvalidReason)
          finalError = lastInvalidReason
          continue
        }
        finalMove = { from: legal.from, to: legal.to }
      }

      if (finalMove && epoch === gameEpoch) {
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

    // 推进下一回合：仅当本代仍有效、成功走子，且调用方要求续走时才继续
    if (finalMove && epoch === gameEpoch) {
      if (result.value) {
        playing.value = false
      } else if (options.continueAfterMove && playing.value) {
        const next = opposite(side)
        if (!currentPlayer(next).isHuman) activeTurn = aiTurn(next, options)
      }
    }
  }

  /* ---------- 初始化 / 标签页后台 ---------- */

  let resolveReady: (() => void) | null = null
  const ready = new Promise<void>((r) => {
    resolveReady = r
  })

  async function init() {
    try {
      await loadGames()
      const id = readActiveGameId()
      if (id) {
        const doc = await getGame(id)
        if (doc) loadDocIntoActive(doc, false)
      }
    } catch {
      /* IDB/存储不可用 */
    } finally {
      resolveReady?.()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const side = turn.value
      if (playing.value && !busy.value && !thinking.value && !result.value && !currentPlayer(side).isHuman) {
        activeTurn = aiTurn(side, { continueAfterMove: true })
      }
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void saveCurrent('active'))
  }

  void init()

  return {
    game,
    board,
    config,
    models,
    games,
    activeGameId,
    tabId,
    ready,
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
    createGame,
    viewGame,
    resumeGame,
    continueGame,
    abandonCurrent,
    deleteGame,
    loadGames,
    stopTurn,
    abortAndPause,
    retryTurn,
    humanMove,
    pause,
    resume,
    step,
    kick,
  }
})