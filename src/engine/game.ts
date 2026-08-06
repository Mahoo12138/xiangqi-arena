import type { Board, GameResult, Move, MoveRecord, Pos, Side } from '../types'
import { cloneBoard, initialBoard, opposite } from './board'
import { genLegalMoves, hasLegalMove, isInCheck } from './moves'
import { notation } from './notation'

export class Game {
  board: Board
  turn: Side = 'red'
  moveHistory: MoveRecord[] = []
  result: GameResult = null

  constructor(board?: Board) {
    this.board = board ? cloneBoard(board) : initialBoard()
  }

  get moveCount(): number {
    return this.moveHistory.length
  }

  get legalMoveList(): Move[] {
    if (this.result) return []
    return genLegalMoves(this.board, this.turn)
  }

  // 尝试落子，返回是否成功。只接受权威合法走法：调用方传坐标，
  // 由 Game 内部匹配 legalMoveList，杜绝棋子瞬移、走对方棋子等伪造 Move。
  tryMove(from: Pos, to: Pos): boolean {
    if (this.result) return false

    const move = this.legalMoveList.find(
      (item) =>
        item.from.rank === from.rank &&
        item.from.file === from.file &&
        item.to.rank === to.rank &&
        item.to.file === to.file,
    )
    if (!move) return false

    const { cn, wxf } = notation(move)
    this.board[move.to.rank][move.to.file] = move.piece
    this.board[move.from.rank][move.from.file] = null
    this.moveHistory.push({ move, cn, wxf, thinkMs: 0, tokens: 0, reasoning: '' })
    this.turn = opposite(this.turn)
    this.updateResult()
    return true
  }

  private updateResult() {
    if (!hasLegalMove(this.board, this.turn)) {
      // 无合法着法：被将死或困毙，均判当前行棋方负
      const reason = isInCheck(this.board, this.turn) ? 'checkmate' : 'stalemate'
      this.result = { type: 'win', winner: opposite(this.turn), reason }
    } else if (this.moveCount >= 300) {
      // 封顶，避免无限对弈
      this.result = { type: 'draw', reason: 'move-limit' }
    }
  }

  // 从坐标字符串解析走法，例如 "a2e2" 或 "a2-e2"
  parseMove(text: string): Move | null {
    const t = text.trim().toLowerCase().replace(/[（(].*?[）)]/g, '').replace(/['"`]/g, '')
    const m = t.match(/^([a-i])(\d)\s*[- ]?\s*([a-i])(\d)$/)
    if (!m) return null
    const from = { rank: Number(m[2]), file: m[1].charCodeAt(0) - 97 }
    const to = { rank: Number(m[4]), file: m[3].charCodeAt(0) - 97 }
    const piece = this.board[from.rank][from.file]
    if (!piece) return null
    return { from, to, piece, captured: this.board[to.rank][to.file] }
  }

  // 通过文本找合法走法
  findLegalByText(text: string): Move | null {
    const m = this.parseMove(text)
    if (!m) return null
    return this.legalMoveList.find(
      (lm) =>
        lm.from.rank === m.from.rank &&
        lm.from.file === m.from.file &&
        lm.to.rank === m.to.rank &&
        lm.to.file === m.to.file,
    ) ?? null
  }

  clone(): Game {
    const g = new Game(this.board)
    g.turn = this.turn
    g.moveHistory = this.moveHistory.map((r) => ({ ...r, move: { ...r.move, from: { ...r.move.from }, to: { ...r.move.to } } }))
    g.result = this.result
    return g
  }
}