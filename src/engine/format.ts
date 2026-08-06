import type { Board, MoveRecord, Side } from '../types'
import { FILES, RANK_COUNT } from './board'

const PIECE_LEGEND = `棋子对照:
  K=帅(红将)  A=仕(红士)  E=相(红象)  H=马(红)  R=车(红)  C=炮(红)  P=兵(红)
  k=将(黑将)  a=士(黑士)  e=象(黑象)  h=马(黑)  r=车(黑)  c=炮(黑)  p=卒(黑)`

export function renderBoard(board: Board): string {
  const lines: string[] = []
  lines.push('  列(file):  ' + FILES.map((f) => ` ${f} `).join(''))
  for (let r = RANK_COUNT - 1; r >= 0; r--) {
    const cells = board[r].map((c) => (c ? ` ${c} ` : '  . ')).join('')
    lines.push(`行${String(r).padStart(2)}(rank): ` + cells)
  }
  return lines.join('\n')
}

// 生成给大模型的局面提示词
export function buildPrompt(
  board: Board,
  side: Side,
  history: MoveRecord[],
  lastError?: string,
): string {
  const sideLabel = side === 'red' ? '红方(Red)' : '黑方(Black)'
  const sidePiece = side === 'red' ? '大写字母' : '小写字母'

  const hist = history.map((r, i) => {
    const n = Math.floor(i / 2) + 1
    const mark = i % 2 === 0 ? `${n}. 红` : '   黑'
    return `${mark} ${r.cn} (${r.wxf})`
  })

  const histText = hist.length ? hist.join('\n') : '(尚无走法，这是开局)'

  const prompt = `你是中国象棋(Xiangqi)的${sideLabel}。你的目标是走出当前局面下最合理的一步棋。

当前棋盘（红方棋子用${sidePiece}表示，黑方用另一组表示；空位用 . 表示）:
${renderBoard(board)}

${PIECE_LEGEND}

轮到谁走: ${sideLabel}
走法历史(红方执红先走):
${histText}

请只输出一步合法走法。格式必须为 起点坐标到终点坐标，使用棋盘图上的 列(file: a-i) 和 行(rank: 0-9)。
列号在棋盘顶部，行号在棋盘左侧。例如棋盘上 (列a, 行2) 写作 "a2"。
输出格式:
  <起点><终点>
例如: a7a6  或  a7-a6

规则: 必须遵从中国象棋规则（将/帅不能照面，马走日、蹩马腿，象走田、塞象眼、不能过河，炮需隔子打，兵过河后可横走等）。
只输出一个走法，不要输出任何解释或其他文字。${
    lastError ? `\n上次你给出的走法无效，原因: ${lastError}。请重新给出一个合法走法。` : ''
  }`

  return prompt
}