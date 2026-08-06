import type { Board, MoveRecord, Side } from '../types'
import { FILES, RANK_COUNT, fileChar, pieceName } from './board'
import { genLegalMoves } from './moves'

const PIECE_LEGEND = `棋子符号:
  K=帅(红将) A=仕(红士) E=相(红象) H=马 R=车 C=炮 P=兵
  k=将(黑将) a=士(黑士) e=象(黑象) h=马 r=车 c=炮 p=卒`

// 渲染棋盘：列 file 在顶部，行 rank 在左侧，每格固定 3 字符宽，列严格对齐。
export function renderBoard(board: Board): string {
  const lines: string[] = []
  lines.push('    ' + FILES.map((f) => ` ${f} `).join(''))
  for (let r = RANK_COUNT - 1; r >= 0; r--) {
    const cells = board[r].map((c) => ` ${c ?? '.'} `).join('')
    lines.push(String(r).padEnd(4) + cells)
  }
  return lines.join('\n')
}

// 行棋记录统一用网格坐标（列 a-i + 行 0-9），不使用传统记谱，避免坐标换算。
function renderHistory(history: MoveRecord[]): string {
  if (!history.length) return '(开局，尚无走法)'
  const full = history.map((r, i) => {
    const from = `${fileChar(r.move.from.file)}${r.move.from.rank}`
    const to = `${fileChar(r.move.to.file)}${r.move.to.rank}`
    const tag = i % 2 === 0 ? `红 ${from}-${to}` : `黑 ${from}-${to}`
    const n = Math.floor(i / 2) + 1
    return i % 2 === 0 ? `${n}.${tag}` : `    ${tag}`
  })
  return full.join('\n')
}

// 由引擎计算当前方全部合法走法，按棋子分组渲染为坐标列表。
// 让模型只做战术取舍，不再自行计算合法性。
function renderLegalMoves(board: Board, side: Side): string {
  const moves = genLegalMoves(board, side)
  if (!moves.length) return '(无合法走法，对局已结束)'
  const groups = new Map<string, string[]>()
  for (const m of moves) {
    const s = `${fileChar(m.from.file)}${m.from.rank}-${fileChar(m.to.file)}${m.to.rank}`
    const label = pieceName(m.piece)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(s)
  }
  const lines: string[] = []
  for (const [label, list] of groups) {
    lines.push(`  ${label}: ${list.join('  ')}`)
  }
  return lines.join('\n')
}

// 生成给大模型的局面提示词。
// 约束任务（选哪一步、怎么输出）和决策策略（按什么流程取舍），
// 但不干预模型的思维过程——思维链由模型自身生成，无法用提示词套格式。
export function buildPrompt(
  board: Board,
  side: Side,
  history: MoveRecord[],
  lastError?: string,
): string {
  const sideLabel = side === 'red' ? '红方 Red' : '黑方 Black'

  const prompt = `你是中国象棋(Xiangqi)的${sideLabel}，一位特级大师。请从给定的合法走法中，选出当前局面下最合理的一步。

【棋盘】红方棋子大写、黑方小写，空位用 . 。列 file 见顶部，行 rank 见左侧。
${renderBoard(board)}

${PIECE_LEGEND}

【轮到】${sideLabel}（红先）

【行棋记录】全部为网格坐标（列 a-i + 行 0-9）
${renderHistory(history)}

【合法走法】以下为本方全部合法走法（已由引擎计算，无需自行判断合法性），请且只从中选择一步：
${renderLegalMoves(board, side)}

【决策流程】按特级大师的方法取舍候选，不必逐条枚举走子规则：
1. 识局：先抓双方对抗焦点（威胁、弱点、子力配置），判断当前该攻还是该守。
2. 定式：判断是否命中开局/中局定式或常见战术，命中则优先套用。
3. 候选：只从上方合法列表中挑 2-3 个最有价值的候选，比较其后续影响。
4. 成着：选定唯一最佳走法，直接输出。

输出要求：只输出一步走法，格式为 <起点><终点>，如 a7a6 或 a7-a6。必须从上方【合法走法】列表中选择，最终只输出走法本身，不要任何解释或多余文字。${
    lastError ? `\n注意：上次你给出的走法无效，原因：${lastError}。请换一个真正合法的走法。` : ''
  }`

  return prompt
}