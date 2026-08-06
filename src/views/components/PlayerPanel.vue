<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import type { Side } from '../../types'

const props = defineProps<{ side: Side }>()
const store = useGameStore()

const cfg = computed(() => store.currentPlayer(props.side))
const isTurn = computed(() => store.turn === props.side && !store.result)
const isThinking = computed(() => store.thinking === props.side)
const outcome = computed(() => {
  const r = store.result
  if (!r) return ''
  if (r.type === 'draw') return '和棋 · Draw'
  return r.winner === props.side ? '胜 · Win' : '负 · Loss'
})
</script>

<template>
  <div class="player" :class="[side, { turn: isTurn, thinking: isThinking }]">
    <div class="head">
      <span class="dot"></span>
      <span class="name">{{ cfg.name }}</span>
      <span class="tag">{{ side === 'red' ? '红 Red' : '黑 Black' }}</span>
    </div>
    <div class="meta">
      <div class="row"><span class="k">模型 Model</span><span class="v">{{ cfg.model }}</span></div>
      <div class="row"><span class="k">类型 Type</span><span class="v">{{ cfg.isHuman ? '人类 Human' : 'AI' }}</span></div>
    </div>
    <div class="status">
      <span v-if="isThinking" class="thinking-label">思考中 · Thinking…</span>
      <span v-else-if="isTurn" class="turn-label">轮到 · Your move</span>
      <span v-else-if="outcome" class="outcome">{{ outcome }}</span>
      <span v-else class="idle">等待 · Waiting</span>
    </div>
  </div>
</template>

<style scoped>
.player {
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(23, 26, 31, 0.9), rgba(14, 16, 19, 0.7));
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  transition: border-color var(--dur-base) var(--ease), box-shadow var(--dur-base) var(--ease);
}
/* 轮到该方：鎏金描边 + 柔和光晕 + 顶部细线 */
.player.turn {
  border-color: rgba(201, 168, 106, 0.6);
  background: linear-gradient(180deg, rgba(201, 168, 106, 0.08), rgba(23, 26, 31, 0.9));
  box-shadow: 0 0 0 1px rgba(201, 168, 106, 0.25), 0 6px 24px rgba(201, 168, 106, 0.08);
}
.player.turn::after {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 16px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
}
.player.turn .name {
  color: var(--gold);
}
.player.red .dot {
  background: var(--vermilion);
  box-shadow: 0 0 8px rgba(200, 64, 46, 0.6);
}
.player.black .dot {
  background: #6b7a92;
  box-shadow: 0 0 8px rgba(107, 122, 146, 0.5);
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex: none;
}
.player.turn .dot,
.player.thinking .dot {
  animation: dot-pulse 1.4s var(--ease-in-out) infinite;
}
@keyframes dot-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.12);
  }
}
.name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
}
.tag {
  margin-left: auto;
  font-size: 11px;
  color: var(--gray-ink);
  background: var(--panel-2);
  padding: 2px 8px;
  border-radius: 20px;
  letter-spacing: 1px;
}
.meta {
  margin-top: 12px;
  font-size: 13px;
}
.row {
  display: flex;
  justify-content: space-between;
  margin: 4px 0;
}
.k {
  color: var(--muted);
}
.v {
  color: var(--text);
  word-break: break-all;
  text-align: right;
}
.status {
  margin-top: 12px;
  font-size: 13px;
  min-height: 20px;
}
.turn-label {
  color: var(--gold);
  font-weight: 600;
}
.thinking-label {
  color: var(--jade);
  font-weight: 600;
  animation: blink 1.4s var(--ease-in-out) infinite;
}
.outcome {
  color: #7bd88a;
  font-weight: 700;
}
.idle {
  color: var(--muted);
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>