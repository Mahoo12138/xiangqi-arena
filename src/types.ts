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

export type GameResult = { type: 'checkmate'; winner: Side } | { type: 'stalemate' } | null

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

export interface GameStatus {
  result: GameResult
  turn: Side
  moveCount: number
}