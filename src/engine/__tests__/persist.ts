import { Game } from '../game'
import { initialBoard } from '../board'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) pass++
  else {
    fail++
    console.error(`  ✗ ${name}${detail ? ' -- ' + detail : ''}`)
  }
}

// 模拟 store 的 saveState/loadState 往返：走几步 → 序列化关键字段 → 还原到新 Game
const g = new Game()
const moves = ['h2e2', 'h9g7', 'b0c2', 'b9c7', 'h0g2']
for (const m of moves) {
  const mv = g.parseMove(m)
  if (!mv || !g.tryMove(mv.from, mv.to)) {
    console.error(`move ${m} failed`)
    process.exit(1)
  }
}

// 序列化（与 store.saveState 相同的字段）
const saved = {
  board: g.board,
  turn: g.turn,
  result: g.result,
  moveHistory: g.moveHistory,
}

// 还原（与 store.loadState 相同的逻辑）
const g2 = new Game()
g2.board = saved.board
g2.turn = saved.turn
g2.result = saved.result
g2.moveHistory = saved.moveHistory

check('还原后棋盘一致', JSON.stringify(g2.board) === JSON.stringify(g.board))
check('还原后轮到一致', g2.turn === g.turn)
check('还原后记谱步数一致', g2.moveHistory.length === g.moveHistory.length, `${g2.moveHistory.length}`)
check('还原后可继续找合法走法', g2.legalMoveList.length > 0)
check('还原后记谱可读', g2.moveHistory[0].cn.length > 0, g2.moveHistory[0].cn)

// 还可继续走子（此时轮到黑方）
const next = g2.parseMove('b7b4')
check('还原后可继续走子', !!next && g2.tryMove(next!.from, next!.to), `turn=${g2.turn}`)

check('初始棋盘仍正常', initialBoard()[0][0] === 'R')

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (fail > 0) process.exit(1)