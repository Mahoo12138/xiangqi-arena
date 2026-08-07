import 'fake-indexeddb/auto'
import { deleteGame, getAllGames, getGame, putGame } from '../indexeddb'
import { initialBoard } from '../../engine/board'
import type { GameDoc } from '../../types'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) pass++
  else {
    fail++
    console.error(`  ✗ ${name}${detail ? ' -- ' + detail : ''}`)
  }
}

function doc(id: string, updatedAt: number): GameDoc {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    status: 'active',
    config: {
      red: { side: 'red', isHuman: false, model: 'm', name: '红' },
      black: { side: 'black', isHuman: false, model: 'm', name: '黑' },
    },
    board: initialBoard(),
    turn: 'red',
    result: null,
    moves: [],
  }
}

// put 三个对局，updatedAt 不同
await putGame(doc('a', 100))
await putGame(doc('b', 300))
await putGame(doc('c', 200))

// getAllGames 按 updatedAt 降序
const all = await getAllGames()
check('返回 3 局', all.length === 3, `${all.length}`)
check('按 updatedAt 降序 b,c,a', all.map((d) => d.id).join(',') === 'b,c,a', all.map((d) => d.id).join(','))

// getGame
const b = await getGame('b')
check('getGame 命中', b?.id === 'b')
const missing = await getGame('zzz')
check('getGame 未命中返回 undefined', missing === undefined)

// deleteGame
await deleteGame('b')
const after = await getAllGames()
check('删除后剩 2 局', after.length === 2, `${after.length}`)
check('删除的对局不存在', (await getGame('b')) === undefined)

// 更新已存在对局（put 覆盖）
const updated = doc('c', 999)
await putGame(updated)
const c = await getGame('c')
check('put 覆盖更新 updatedAt', c?.updatedAt === 999, `${c?.updatedAt}`)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (fail > 0) process.exit(1)