import type { Board, Move, MoveRecord, Side } from '../types'
import { FILES, RANK_COUNT, fileChar } from './board'
import { isInCheck } from './moves'

// 固定 system prompt：只解释一次棋规表达，不随每步重复。
export const SYSTEM_PROMPT = `
You are playing Xiangqi.

The position uses Xiangqi FEN.
Ranks are ordered from black's back rank to red's back rank.
Uppercase pieces are red and lowercase pieces are black.

Choose the strongest move from the complete numbered legal move list.
Evaluate tactics, king safety, material, initiative and positional consequences.

Return only the integer move index.
Do not output explanations, coordinates, JSON or other text.
`.trim()

// 把棋盘转成史纳法（Xiangqi FEN）：行从黑方底线(rank9)排到红方底线(rank0)，
// 连续空位用数字压缩，行间用 / 分隔。
export function toFen(board: Board): string {
  const rows: string[] = []
  for (let r = 9; r >= 0; r--) {
    let row = ''
    let empty = 0
    for (let f = 0; f < 9; f++) {
      const p = board[r][f]
      if (!p) {
        empty++
        continue
      }
      if (empty > 0) {
        row += empty
        empty = 0
      }
      row += p
    }
    if (empty > 0) row += empty
    rows.push(row)
  }
  return rows.join('/')
}

function moveStr(m: Move): string {
  return `${fileChar(m.from.file)}${m.from.rank}${fileChar(m.to.file)}${m.to.rank}`
}

// 重复局面/长将长捉等规则尚未实现前，仅保留最近若干半回合，避免整盘历史不断累积。
const MAX_RECENT = 8

// 生成给模型的极简动态提示：当前局面、行动方、最后一步、是否被将军、
// 最近半回合，以及编号后的全部合法走法。合法走法一个不筛，由模型自行取舍。
export function buildPrompt(
  board: Board,
  side: Side,
  history: MoveRecord[],
  legalMoves: Move[],
  lastError?: string,
): string {
  const sideToken = side === 'red' ? 'r' : 'b'
  const last = history.length ? moveStr(history[history.length - 1].move) : '-'
  const recent = history.slice(-MAX_RECENT).map((h) => moveStr(h.move)).join(',') || '-'
  const check = isInCheck(board, side) ? '1' : '0'
  const moves = legalMoves.map((m, i) => `${i}=${moveStr(m)}`).join(',')

  const lines = [
    `P:${toFen(board)}`,
    `T:${sideToken}`,
    `LAST:${last}`,
    `CHECK:${check}`,
    `H:${recent}`,
    `M:${moves}`,
  ]
  if (lastError) lines.push(`NOTE:${lastError}`)
  return lines.join('\n')
}

// 渲染棋盘：列 file 在顶部，行 rank 在左侧，每格固定 3 字符宽，列严格对齐。
// 主要用于本地调试与测试，不进入模型提示词。
export function renderBoard(board: Board): string {
  const lines: string[] = []
  lines.push('    ' + FILES.map((f) => ` ${f} `).join(''))
  for (let r = RANK_COUNT - 1; r >= 0; r--) {
    const cells = board[r].map((c) => ` ${c ?? '.'} `).join('')
    lines.push(String(r).padEnd(4) + cells)
  }
  return lines.join('\n')
}