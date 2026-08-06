import type { Board, Piece, Pos, Side } from '../types'

export const FILE_COUNT = 9
export const RANK_COUNT = 10

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

export function fileChar(f: number): string {
  return FILES[f] ?? '?'
}

function isRed(p: Piece): boolean {
  return p === p.toUpperCase()
}

export function sideOf(p: Piece): Side {
  return isRed(p) ? 'red' : 'black'
}

export function opposite(s: Side): Side {
  return s === 'red' ? 'black' : 'red'
}

export function pieceName(p: Piece): string {
  const map: Record<string, string> = {
    K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', P: '兵',
    k: '将', a: '士', e: '象', h: '马', r: '车', c: '炮', p: '卒',
  }
  return map[p] ?? p
}

export function initialBoard(): Board {
  const b: Board = Array.from({ length: RANK_COUNT }, () =>
    Array<Piece | null>(FILE_COUNT).fill(null),
  )
  const back: Piece[] = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R']

  for (let f = 0; f < FILE_COUNT; f++) {
    b[0][f] = back[f]
    b[9][f] = back[f].toLowerCase() as Piece
  }
  b[2][1] = 'C'
  b[2][7] = 'C'
  b[7][1] = 'c'
  b[7][7] = 'c'
  for (let f = 0; f < 9; f += 2) {
    b[3][f] = 'P'
    b[6][f] = 'p'
  }
  return b
}

export function inBoard(pos: Pos): boolean {
  return pos.rank >= 0 && pos.rank < RANK_COUNT && pos.file >= 0 && pos.file < FILE_COUNT
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.rank === b.rank && a.file === b.file
}

export function pieceAt(board: Board, pos: Pos): Piece | null {
  return board[pos.rank][pos.file]
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice())
}

export function kingPos(board: Board, side: Side): Pos | null {
  const goal: Piece = side === 'red' ? 'K' : 'k'
  for (let r = 0; r < RANK_COUNT; r++) {
    for (let f = 0; f < FILE_COUNT; f++) {
      if (board[r][f] === goal) return { rank: r, file: f }
    }
  }
  return null
}