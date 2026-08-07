<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import type { GameSummary } from '../types'

const router = useRouter()
const store = useGameStore()

onMounted(() => void store.loadGames())

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function statusText(s: GameSummary): string {
  if (s.status === 'finished') return '已完成 · Finished'
  if (s.status === 'abandoned') return '已放弃 · Abandoned'
  return '进行中 · Active'
}

function resultText(s: GameSummary): string {
  const r = s.result
  if (!r) return '—'
  if (r.type === 'draw') return '和棋 · Draw'
  return r.winner === 'red' ? '红胜 · Red' : '黑胜 · Black'
}

function claimed(s: GameSummary): boolean {
  return !!s.tabClaim && s.tabClaim !== store.tabId && (s.leasUntil ?? 0) > Date.now()
}

async function open(s: GameSummary) {
  await store.viewGame(s.id)
  router.push('/game')
}

async function resume(s: GameSummary) {
  const ok = await store.continueGame(s.id)
  if (ok) router.push('/game')
}

async function remove(s: GameSummary) {
  if (!window.confirm(`删除该对局？操作不可撤销。`)) return
  await store.deleteGame(s.id)
}
</script>

<template>
  <div class="history">
    <div class="head">
      <h2>我的对局 · Match History</h2>
      <div class="head-actions">
        <button class="btn ghost" @click="store.loadGames">刷新 · Refresh</button>
        <button class="btn" @click="router.push('/config')">新建对局 · New</button>
      </div>
    </div>
    <p class="hint">所有对局与每一步的思维链都保存在本机 IndexedDB。被其他标签页正在执行的对局会显示「占用」，无法在此续走。</p>

    <div v-if="store.error" class="error">{{ store.error }}</div>

    <div v-if="!store.games.length" class="empty">
      <p>还没有任何对局。</p>
      <button class="btn" @click="router.push('/config')">配置并开始一局 · Start a Match</button>
    </div>

    <div v-else class="list">
      <div v-for="g in store.games" :key="g.id" class="card game">
        <div class="row top">
          <span class="status" :class="g.status">{{ statusText(g) }}</span>
          <span class="time">{{ fmtTime(g.updatedAt) }}</span>
        </div>
        <div class="matchup">
          <div class="player red">
            <span class="dot"></span>
            <span class="name">{{ g.redName }}</span>
            <span class="model">{{ g.redModel }}</span>
          </div>
          <span class="vs">VS</span>
          <div class="player black">
            <span class="dot"></span>
            <span class="name">{{ g.blackName }}</span>
            <span class="model">{{ g.blackModel }}</span>
          </div>
        </div>
        <div class="row meta">
          <span class="chip">已行 {{ g.moveCount }} 步</span>
          <span class="chip result">{{ resultText(g) }}</span>
          <span v-if="claimed(g)" class="chip lock">其它标签页占用 · Locked</span>
        </div>
        <div class="row actions">
          <button class="btn ghost" @click="open(g)">查看 · View</button>
          <button class="btn" :disabled="claimed(g) || g.status === 'finished'" @click="resume(g)">续走 · Resume</button>
          <button class="btn ghost danger" @click="remove(g)">删除 · Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history {
  max-width: 860px;
  margin: 0 auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: 3px;
}
.head-actions {
  display: flex;
  gap: 10px;
}
.hint {
  color: var(--muted);
  font-size: 13px;
  margin: 6px 0 20px;
}
.error {
  color: #ff6b6b;
  font-size: 13px;
  background: rgba(255, 107, 107, 0.1);
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 14px;
}
.empty {
  text-align: center;
  color: var(--gray-ink);
  padding: 60px 0;
}
.empty p {
  margin: 0 0 16px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.game {
  padding: 14px 16px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row.top {
  justify-content: space-between;
  margin-bottom: 10px;
}
.status {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
  font-family: var(--font-hud);
  letter-spacing: 1px;
}
.status.active {
  color: var(--jade);
  background: rgba(90, 168, 156, 0.14);
}
.status.finished {
  color: var(--paper);
  background: rgba(201, 168, 106, 0.16);
}
.status.abandoned {
  color: var(--gray-ink);
  background: var(--panel-2);
}
.time {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.matchup {
  display: flex;
  align-items: center;
  gap: 14px;
}
.player {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.player .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.player.red .dot {
  background: var(--vermilion);
}
.player.black .dot {
  background: #6b7a92;
}
.player .name {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--paper);
}
.player .model {
  color: var(--gray-ink);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.vs {
  color: var(--gold);
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: 2px;
}
.row.meta {
  margin-top: 12px;
}
.chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--panel-2);
  color: var(--gray-ink);
}
.chip.result {
  color: var(--gold);
}
.chip.lock {
  color: #ffb454;
  background: rgba(255, 180, 84, 0.12);
}
.row.actions {
  margin-top: 14px;
  justify-content: flex-end;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.danger {
  border-color: rgba(255, 107, 107, 0.5);
  color: #ff8d8d;
}
.btn.danger:hover {
  background: rgba(255, 107, 107, 0.12);
}
</style>