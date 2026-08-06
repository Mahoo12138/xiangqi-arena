import { Game } from '../game'
import { initialBoard } from '../board'
import { buildPrompt, SYSTEM_PROMPT, toFen } from '../format'
import { extractMoveIndex } from '../../api/openai'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) pass++
  else {
    fail++
    console.error(`  ✗ ${name}${detail ? ' -- ' + detail : ''}`)
  }
}

// 1. 初始局面 FEN 与标准史纳法一致
check(
  '初始局面 FEN',
  toFen(initialBoard()) === 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR',
  toFen(initialBoard()),
)

// 2. 走动后 FEN 同步变化（红炮 h2->e2）
{
  const g = new Game()
  g.tryMove({ rank: 2, file: 7 }, { rank: 2, file: 4 })
  const fen = toFen(g.board)
  check(
    '走子后 FEN 精确匹配',
    fen === 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RHEAKAEHR',
    fen,
  )
}

// 3. buildPrompt 输出紧凑格式：P/T/LAST/CHECK/H/M
{
  const g = new Game()
  const legalMoves = g.legalMoveList
  const prompt = buildPrompt(g.board, 'red', g.moveHistory, legalMoves)
  const lines = prompt.split('\n')
  check('包含 P: 局面行', lines.some((l) => l.startsWith('P:')), prompt)
  check('行动方为 r', lines.some((l) => l === 'T:r'), prompt)
  check('无历史时 LAST:-', lines.some((l) => l === 'LAST:-'), prompt)
  check('无历史时 H:-', lines.some((l) => l === 'H:-'), prompt)
  check('CHECK 行存在', lines.some((l) => l.startsWith('CHECK:')), prompt)
  const movesLine = lines.find((l) => l.startsWith('M:'))
  check('M: 行存在', !!movesLine, prompt)
  check('走法编号从 0 起', Boolean(movesLine?.startsWith('M:0=')), movesLine)
  check('走法数与合法走法数一致', movesLine?.split(',').length === legalMoves.length, movesLine)
}

// 4. 初始局面红方首个合法走法编号 0 是 a0 车，可解析为坐标
{
  const g = new Game()
  const legalMoves = g.legalMoveList
  const first = legalMoves[0]
  check('编号 0 走法为 a0 车的前进', !!first && first.from.file === 0 && first.from.rank === 0 && first.to.rank === 1, JSON.stringify(first))
}

// 5. extractMoveIndex 解析
check('extractMoveIndex("4") = 4', extractMoveIndex('4') === 4)
check('extractMoveIndex("Move: 4") = 4', extractMoveIndex('Move: 4') === 4)
check('extractMoveIndex("0") = 0', extractMoveIndex('0') === 0)
check('extractMoveIndex("abc") = null', extractMoveIndex('abc') === null)

// 6. system prompt 为固定英文规则说明
check('SYSTEM_PROMPT 非空且含 FEN 说明', SYSTEM_PROMPT.includes('Xiangqi FEN') && SYSTEM_PROMPT.includes('integer move index'))

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (fail > 0) process.exit(1)
void buildPrompt