import type { Board, Move, Piece, Pos, Side } from '../types'
import { cloneBoard, inBoard, kingPos, opposite, pieceAt, sideOf } from './board'

// 九宫范围（将/士可活动范围）
function inPalace(pos: Pos, side: Side): boolean {
  if (pos.file < 3 || pos.file > 5) return false
  if (pos.rank < 0 || pos.rank > 9) return false
  return side === 'red' ? pos.rank <= 2 : pos.rank >= 7
}

function isOwn(p: Piece | null, side: Side): boolean {
  return p !== null && sideOf(p) === side
}

// 生成一个兵种在当前位置的所有伪合法走法（不含将军过滤）
function pseudoMoves(board: Board, pos: Pos, side: Side): Pos[] {
  const p = pieceAt(board, pos)
  if (!p || sideOf(p) !== side) return []
  const res: Pos[] = []
  const { rank, file } = pos
  const type = p.toUpperCase()
  const forward = side === 'red' ? 1 : -1

  const add = (r: number, f: number) => {
    const t = { rank: r, file: f }
    if (inBoard(t) && !isOwn(pieceAt(board, t), side)) res.push(t)
  }
  const addStraight = (dr: number, df: number) => {
    let r = rank + dr
    let f = file + df
    while (inBoard({ rank: r, file: f })) {
      const cell = pieceAt(board, { rank: r, file: f })
      if (cell === null) {
        res.push({ rank: r, file: f })
      } else {
        if (sideOf(cell) !== side) res.push({ rank: r, file: f })
        break
      }
      r += dr
      f += df
    }
  }

  switch (type) {
    case 'K': {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      for (const [dr, df] of dirs) {
        const r = rank + dr
        const f = file + df
        if (inPalace({ rank: r, file: f }, side) && !isOwn(pieceAt(board, { rank: r, file: f }), side)) {
          res.push({ rank: r, file: f })
        }
      }
      break
    }
    case 'A': {
      for (const [dr, df] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const t = { rank: rank + dr, file: file + df }
        if (inPalace(t, side) && !isOwn(pieceAt(board, t), side)) res.push(t)
      }
      break
    }
    case 'E': {
      // 象：田字，不能过河，塞象眼
      const homeRank = side === 'red' ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9]
      for (const [dr, df] of [
        [2, 2],
        [2, -2],
        [-2, 2],
        [-2, -2],
      ]) {
        const r = rank + dr
        const f = file + df
        const eye = { rank: rank + dr / 2, file: file + df / 2 }
        if (!inBoard({ rank: r, file: f })) continue
        if (!homeRank.includes(r)) continue
        if (pieceAt(board, eye) !== null) continue // 塞象眼
        if (!isOwn(pieceAt(board, { rank: r, file: f }), side)) res.push({ rank: r, file: f })
      }
      break
    }
    case 'H': {
      // 马：日字，蹩马腿
      const dirs: Array<[number, number, number, number]> = [
        // dr, df, 马腿偏移
        [-2, -1, -1, 0],
        [-2, 1, -1, 0],
        [2, -1, 1, 0],
        [2, 1, 1, 0],
        [-1, -2, 0, -1],
        [1, -2, 0, -1],
        [-1, 2, 0, 1],
        [1, 2, 0, 1],
      ]
      for (const [dr, df, lr, lf] of dirs) {
        const leg = { rank: rank + lr, file: file + lf }
        if (!inBoard(leg) || pieceAt(board, leg) !== null) continue // 蹩马腿
        const t = { rank: rank + dr, file: file + df }
        if (inBoard(t) && !isOwn(pieceAt(board, t), side)) res.push(t)
      }
      break
    }
    case 'R': {
      addStraight(1, 0)
      addStraight(-1, 0)
      addStraight(0, 1)
      addStraight(0, -1)
      break
    }
    case 'C': {
      // 炮：直行不吃子，吃子需隔一个
      const scan = (dr: number, df: number) => {
        let r = rank + dr
        let f = file + df
        let jumped = false
        while (inBoard({ rank: r, file: f })) {
          const cell = pieceAt(board, { rank: r, file: f })
          if (!jumped) {
            if (cell === null) {
              res.push({ rank: r, file: f })
            } else {
              jumped = true
            }
          } else {
            if (cell !== null) {
              if (sideOf(cell) !== side) res.push({ rank: r, file: f })
              break
            }
          }
          r += dr
          f += df
        }
      }
      scan(1, 0)
      scan(-1, 0)
      scan(0, 1)
      scan(0, -1)
      break
    }
    case 'P': {
      // 兵：未过河只能前进；过河后可前进或横走，但始终不能后退
      const crossed = side === 'red' ? rank >= 5 : rank <= 4
      add(rank + forward, file) // 前进
      if (crossed) {
        add(rank, file + 1)
        add(rank, file - 1)
      }
      break
    }
  }
  return res
}

// 判断 pos 是否被 enemy 侧的任意棋子攻击
function isAttacked(board: Board, pos: Pos, enemy: Side): boolean {
  for (let r = 0; r < board.length; r++) {
    for (let f = 0; f < board[r].length; f++) {
      const p = board[r][f]
      if (!p || sideOf(p) !== enemy) continue
      const src = { rank: r, file: f }
      // 将帅对脸：将可以沿同列无子直攻
      if (p.toUpperCase() === 'K') {
        if (src.file === pos.file) {
          let blocked = false
          const lo = Math.min(src.rank, pos.rank) + 1
          const hi = Math.max(src.rank, pos.rank)
          for (let rr = lo; rr < hi; rr++) {
            if (board[rr][src.file] !== null) {
              blocked = true
              break
            }
          }
          if (!blocked) return true
        }
        continue
      }
      const targets = pseudoMoves(board, src, enemy)
      for (const t of targets) {
        if (t.rank === pos.rank && t.file === pos.file) return true
      }
    }
  }
  return false
}

export function isInCheck(board: Board, side: Side): boolean {
  const k = kingPos(board, side)
  if (!k) return false
  return isAttacked(board, k, opposite(side))
}

// 返回某方所有合法走法（通过将军过滤）
export function genLegalMoves(board: Board, side: Side): Move[] {
  const res: Move[] = []
  for (let r = 0; r < board.length; r++) {
    for (let f = 0; f < board[r].length; f++) {
      const p = board[r][f]
      if (!p || sideOf(p) !== side) continue
      const src = { rank: r, file: f }
      const targets = pseudoMoves(board, src, side)
      for (const t of targets) {
        const move: Move = { from: src, to: t, piece: p, captured: pieceAt(board, t) }
        if (isLegal(board, move, side)) res.push(move)
      }
    }
  }
  return res
}

// 校验单个走法是否使己方将不被将军（含将帅对脸）
export function isLegal(board: Board, move: Move, side: Side): boolean {
  const nb = cloneBoard(board)
  nb[move.to.rank][move.to.file] = move.piece
  nb[move.from.rank][move.from.file] = null
  return !isInCheck(nb, side)
}

export function hasLegalMove(board: Board, side: Side): boolean {
  return genLegalMoves(board, side).length > 0
}