import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../gameStore'
import type { MatchConfig } from '../../types'

// sessionStorage 用内存 Map 模拟（同一标签页刷新后仍保留）
const mem = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k: string, v: string) => mem.set(k, String(v)),
  removeItem: (k: string) => mem.delete(k),
  clear: () => mem.clear(),
}

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) pass++
  else {
    fail++,
      console.error(`  ✗ ${name}${detail ? ' -- ' + detail : ''}`)
  }
}

function newStore() {
  setActivePinia(createPinia())
  return useGameStore()
}

const cfg: MatchConfig = {
  red: { side: 'red', isHuman: true, model: 'm', name: '红' },
  black: { side: 'black', isHuman: true, model: 'm', name: '黑' },
}

// 第一次「会话」：开局并让红方走一步
const s1 = newStore()
await s1.ready
await s1.createGame(cfg)
check('开局后立即创建历史对局', s1.games.length === 1, `${s1.games.length}`)
check('创建的对局状态为进行中', s1.games[0]?.status === 'active', s1.games[0]?.status)

const ok = await s1.humanMove({ rank: 2, file: 7 }, { rank: 2, file: 4 }) // 红炮二平五
check('红方走子成功', ok)
await new Promise((r) => setTimeout(r, 80)) // 等 fire-and-forget 的落库写完
const expectedMoves = s1.moveCount
check('红方走子后步步数 = 1', expectedMoves === 1, `${expectedMoves}`)

// 第二次「会话」（模拟刷新）：新 store 实例应从 IndexedDB + sessionStorage 恢复
const s2 = newStore()
await s2.ready
check('刷新后恢复步数', s2.moveCount === expectedMoves, `s2=${s2.moveCount} expected=${expectedMoves}`)
check('刷新后恢复棋盘（e2 有红炮）', (s2.board[2][4] as string) === 'C', `got ${s2.board[2][4]}`)
check('刷新后历史列表仍有该局', s2.games.length === 1, `${s2.games.length}`)
check('刷新后仍为进行中', s2.games[0]?.status === 'active', s2.games[0]?.status)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (fail > 0) process.exit(1)