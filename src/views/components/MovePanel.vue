<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import { pieceName } from '../../engine/board'

const store = useGameStore()
const openReason = ref<number | null>(null)

type Rec = typeof store.records[number]
const pairs = computed(() => {
  const out: Array<{ no: number; red?: Rec; black?: Rec; redIdx: number; blackIdx: number }> = []
  for (let i = 0; i < store.records.length; i += 2) {
    out.push({ no: i / 2 + 1, red: store.records[i], redIdx: i, black: store.records[i + 1], blackIdx: i + 1 })
  }
  return out
})

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return (ms / 1000).toFixed(1) + 's'
}

function fmtPiece(r: Rec): string {
  return pieceName(r.move.piece)
}

function toggle(n: number) {
  openReason.value = openReason.value === n ? null : n
}
</script>

<template>
  <div class="move-panel">
    <div class="live" v-if="!store.result">
      <div class="live-row">
        <span class="k">回合 Turn</span>
        <span class="v">{{ store.moveCount % 2 === 0 ? '红 Red' : '黑 Black' }}</span>
      </div>
      <template v-if="store.thinking">
        <div class="live-row">
          <span class="k">思考 Thinking</span>
          <span class="v highlight">{{ fmtMs(store.liveMs) }}</span>
        </div>
        <div class="live-row">
          <span class="k">Token (本步)</span>
          <span class="v">{{ store.liveTokens || '…' }}</span>
        </div>
        <pre v-if="store.liveReasoning" class="live-reason">{{ store.liveReasoning }}</pre>
      </template>
    </div>
    <div v-else class="result">
      <span class="big">{{ store.result.type === 'draw' ? '和棋 · Draw' : (store.result.winner === 'red' ? '红方胜 · Red wins' : '黑方胜 · Black wins') }}</span>
    </div>
    <div v-if="store.error" class="error">{{ store.error }}</div>

    <div class="table rows">
      <template v-for="pair in pairs" :key="pair.no">
        <div class="tr">
          <div class="no">{{ pair.no }}</div>
          <div v-if="pair.red" class="mv" :class="{ open: openReason === pair.redIdx }">
            <div class="cell">
              <span class="p red-p">{{ fmtPiece(pair.red) }}</span>
              <span class="cn">{{ pair.red.cn }}</span>
              <span class="wxf">{{ pair.red.wxf }}</span>
              <span class="chip time">{{ fmtMs(pair.red.thinkMs) }}</span>
              <span class="chip tok">{{ pair.red.tokens }}</span>
            </div>
            <button v-if="pair.red.reasoning" class="reason-toggle" :class="{ on: openReason === pair.redIdx }" @click="toggle(pair.redIdx)">推理查看 · Reasoning</button>
            <Transition name="reason">
              <pre v-if="openReason === pair.redIdx" class="reason">{{ pair.red.reasoning }}</pre>
            </Transition>
          </div>
          <div v-if="pair.black" class="mv" :class="{ open: openReason === pair.blackIdx }">
            <div class="cell">
              <span class="p blk-p">{{ fmtPiece(pair.black) }}</span>
              <span class="cn">{{ pair.black.cn }}</span>
              <span class="wxf">{{ pair.black.wxf }}</span>
              <span class="chip time">{{ fmtMs(pair.black.thinkMs) }}</span>
              <span class="chip tok">{{ pair.black.tokens }}</span>
            </div>
            <button v-if="pair.black.reasoning" class="reason-toggle" :class="{ on: openReason === pair.blackIdx }" @click="toggle(pair.blackIdx)">推理查看 · Reasoning</button>
            <Transition name="reason">
              <pre v-if="openReason === pair.blackIdx" class="reason">{{ pair.black.reasoning }}</pre>
            </Transition>
          </div>
        </div>
      </template>
      <div v-if="!pairs.length" class="empty">尚无走子 · No moves yet</div>
    </div>
  </div>
</template>

<style scoped>
.move-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.live {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.live-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin: 2px 0;
}
.live-row .v.highlight {
  color: var(--jade);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.live-reason {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--muted);
  white-space: pre-wrap;
  max-height: 120px;
  overflow: auto;
}
.result {
  background: var(--panel-2);
  padding: 12px;
  border-radius: 10px;
}
.result .big {
  color: var(--gold);
  font-weight: 700;
  font-family: var(--font-display);
  letter-spacing: 2px;
}
.error {
  color: #ff6b6b;
  font-size: 12px;
  background: rgba(255, 107, 107, 0.1);
  padding: 8px 10px;
  border-radius: 8px;
}
.rows {
  overflow: auto;
  flex: 1;
}
.tr {
  display: grid;
  grid-template-columns: 28px 1fr;
  grid-template-rows: auto auto;
  gap: 6px;
  margin-bottom: 8px;
  animation: row-in var(--dur-base) var(--ease-out);
}
@keyframes row-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.no {
  color: var(--muted);
  font-size: 12px;
  padding-top: 4px;
  font-variant-numeric: tabular-nums;
  grid-row: 1 / 3; /* 跨两行，左侧对齐红/黑两卡片 */
  align-self: start;
}
.mv {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  transition: border-color var(--dur-base) var(--ease);
}
.mv.open {
  border-color: rgba(90, 168, 156, 0.5);
}
.cell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  flex-wrap: wrap;
}
.p {
  font-family: var(--font-display);
  font-weight: 700;
  width: 18px;
}
.red-p {
  color: var(--vermilion);
}
.blk-p {
  color: #9fb0c4;
}
.cn {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 1px;
}
.wxf {
  color: var(--gray-ink);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.chip {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--panel-2);
  color: var(--gray-ink);
  font-variant-numeric: tabular-nums;
}
.chip.tok {
  color: var(--jade);
}
.reason-toggle {
  margin-top: 4px;
  background: none;
  border: 1px solid transparent;
  color: var(--jade);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  transition:
    background-color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease-out);
}
.reason-toggle:hover {
  background: rgba(90, 168, 156, 0.12);
}
.reason-toggle:active {
  transform: scale(0.96);
}
.reason-toggle.on {
  background: rgba(90, 168, 156, 0.14);
}
.reason {
  font-size: 11px;
  color: var(--muted);
  white-space: pre-wrap;
  background: var(--panel-2);
  border-radius: 6px;
  padding: 6px;
  margin: 6px 0 0;
  max-height: 160px;
  overflow: auto;
}
.reason-enter-active,
.reason-leave-active {
  transition:
    opacity var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}
.reason-enter-from,
.reason-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.empty {
  color: var(--muted);
  font-size: 13px;
  padding: 20px;
  text-align: center;
}
</style>