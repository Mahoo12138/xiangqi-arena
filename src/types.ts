export type Side = 'red' | 'black'

export type PieceType = 'K' | 'A' | 'E' | 'H' | 'R' | 'C' | 'P'

// 棋子：红方大写，黑方小写。用 PieceType 的单字符表示。
export type Piece = 'K' | 'A' | 'E' | 'H' | 'R' | 'C' | 'P' | 'k' | 'a' | 'e' | 'h' | 'r' | 'c' | 'p'

export type Board = (Piece | null)[][] // board[rank][file], rank 0=红方底线, file 0=a

export interface Pos {
  rank: number
  file: number
}

export interface Move {
  from: Pos
  to: Pos
  piece: Piece // 移动的棋子
  captured: Piece | null // 被吃掉的棋子
}

// 对局结果：胜、和、或未结束。困毙（stalemate）属无合法着法被迫认负，判负方输。
export type GameResult =
  | {
      type: 'win'
      winner: Side
      reason: 'checkmate' | 'stalemate' | 'resign' | 'timeout'
    }
  | {
      type: 'draw'
      reason: 'agreement' | 'repetition' | 'no-progress' | 'move-limit'
    }
  | null

export interface MoveRecord {
  move: Move
  cn: string // 中文记谱，如 炮二平五
  wxf: string // 英文 WXF 记法，如 C2=5
  thinkMs: number
  tokens: number
  reasoning: string
  error?: string
}

export interface PlayerConfig {
  side: Side
  isHuman: boolean
  model: string
  name: string
}

export interface MatchConfig {
  red: PlayerConfig
  black: PlayerConfig
}

export interface GameStatus {
  result: GameResult
  turn: Side
  moveCount: number
}

// IndexedDB 中持久化的完整对局文档：状态 + 每步 MoveRecord（含思维链 reasoning 与决策记谱）
export type GameStatusFlag = 'active' | 'finished' | 'abandoned'

export interface GameDoc {
  id: string
  createdAt: number
  updatedAt: number
  status: GameStatusFlag
  config: MatchConfig
  board: Board
  turn: Side
  result: GameResult
  moves: MoveRecord[]
  /** 正在执行该局的标签页 id，防止两标签页同时续走同一局 */
  tabClaim?: string
  /** tabClaim 的到期时间；过期后其它标签页可接管（处理标签页崩溃留下的死锁） */
  leasUntil?: number
}

// 历史列表用的轻量摘要
export interface GameSummary {
  id: string
  createdAt: number
  updatedAt: number
  status: GameStatusFlag
  redName: string
  redModel: string
  blackName: string
  blackModel: string
  moveCount: number
  result: GameResult
  tabClaim?: string
  leasUntil?: number
}