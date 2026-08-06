<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import type { Side } from '../types'
import BoardView from './components/BoardView.vue'
import PlayerPanel from './components/PlayerPanel.vue'
import MovePanel from './components/MovePanel.vue'

const router = useRouter()
const store = useGameStore()

// 空格 = 暂停/继续（与顶部提示一致）。输入框/文本区中不拦截。
function onKeydown(e: KeyboardEvent) {
  if (e.code !== 'Space') return
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  e.preventDefault()
  if (store.result) return
  if (store.playing) store.pause()
  else store.resume()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// 高亮方：对局中为当前行棋方，结束后为胜方
const activeSide = computed<Side | null>(() => {
  const r = store.result
  if (r) return r.type === 'win' ? r.winner : null
  return store.turn
})
</script>

<template>
  <div class="game">
    <div class="controls">
      <button class="btn" @click="store.startGame">开局 · New</button>
      <button v-if="store.playing && !store.result" class="btn" @click="store.pause">暂停 · Pause</button>
      <button v-else class="btn" @click="store.resume">继续 · Resume</button>
      <button class="btn ghost" @click="store.step">单步 · Step</button>
      <button v-if="store.thinking" class="btn retry" @click="store.retryTurn">重试此步 · Retry</button>
      <button v-if="store.moveCount > 0 || store.thinking" class="btn ghost" @click="store.discard">弃局重开 · Discard</button>
      <button class="btn ghost" @click="router.push('/config')">配置 · Config</button>
      <span class="tip">空格 Space = 暂停/继续</span>
    </div>

    <div class="layout">
      <aside class="left">
        <PlayerPanel side="red" />
        <PlayerPanel side="black" />
      </aside>

      <section class="mid">
        <div class="match-banner">
          <div class="fighter red" :class="{ active: activeSide === 'red' }">
            <span class="f-dot"></span>
            <span class="f-name">{{ store.config.red.name }}</span>
            <span class="f-model">{{ store.config.red.model }}</span>
          </div>
          <div class="vs">VS</div>
          <div class="fighter black" :class="{ active: activeSide === 'black' }">
            <span class="f-dot"></span>
            <span class="f-name">{{ store.config.black.name }}</span>
            <span class="f-model">{{ store.config.black.model }}</span>
          </div>
        </div>

        <div class="stage">
          <BoardView />
        </div>

        <div class="turn-status" :class="store.thinking ? 'thinking' : ''">
          <span class="live-dot"></span>
          <span v-if="store.result">
            {{ store.result.type === 'draw' ? '和棋 · DRAW' : (store.result.winner === 'red' ? '红方获胜 · RED WINS' : '黑方获胜 · BLACK WINS') }}
          </span>
          <span v-else-if="store.thinking">对弈中 · {{ store.thinking === 'red' ? 'RED' : 'BLACK' }} 思考中</span>
          <span v-else>轮到 {{ store.turn === 'red' ? '红方 RED' : '黑方 BLACK' }}</span>
        </div>
      </section>

      <aside class="right">
        <div class="right-title">记谱 + 数据 · Notation &amp; Stats</div>
        <MovePanel />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.game {
  max-width: 1500px;
  margin: 0 auto;
  height: calc(100vh - 97px);
  min-height: 560px;
  display: flex;
  flex-direction: column;
}
.controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  flex: none;
}
.tip {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
}
.btn.retry {
  background: transparent;
  color: var(--gold);
  border: 1px solid var(--gold);
  box-shadow: none;
  animation: retry-pulse 1.6s var(--ease-in-out) infinite;
}
.btn.retry:hover {
  background: rgba(201, 168, 106, 0.12);
  filter: none;
}
@keyframes retry-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(201, 168, 106, 0.35);
  }
  50% {
    box-shadow: 0 0 0 5px rgba(201, 168, 106, 0.12);
  }
}
.layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px 1fr 378px;
  gap: 16px;
  align-items: stretch;
}
.left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

/* 对弈横幅：两位选手 + 金 VS */
.match-banner {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: none;
}
.fighter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 150px;
  padding: 10px 18px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(23, 26, 31, 0.6);
  transition: border-color var(--dur-base) var(--ease), background-color var(--dur-base) var(--ease);
}
.fighter.active {
  border-color: rgba(201, 168, 106, 0.55);
  background: rgba(201, 168, 106, 0.06);
}
.f-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-bottom: 5px;
}
.fighter.red .f-dot {
  background: var(--vermilion);
  box-shadow: 0 0 10px rgba(200, 64, 46, 0.7);
}
.fighter.black .f-dot {
  background: #6b7a92;
  box-shadow: 0 0 10px rgba(107, 122, 146, 0.6);
}
.f-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--paper);
}
.f-model {
  font-size: 11px;
  color: var(--gray-ink);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.fighter.active .f-name {
  color: var(--gold);
}
.vs {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 4px;
  color: var(--gold);
  opacity: 0.9;
}

/* 舞台：棋盘后方的鎏金聚光 + 四角科技角标 */
.stage {
  position: relative;
  flex: none;
  padding: 26px;
}
.stage::before {
  content: '';
  position: absolute;
  inset: -30px;
  background: radial-gradient(circle at 50% 45%, rgba(201, 168, 106, 0.16), transparent 62%);
  filter: blur(10px);
  pointer-events: none;
  animation: stage-breathe 5s var(--ease-in-out) infinite;
}
.stage::after {
  content: '';
  position: absolute;
  inset: 6px;
  pointer-events: none;
  background:
    linear-gradient(var(--gold), var(--gold)) top left / 14px 2px,
    linear-gradient(var(--gold), var(--gold)) top left / 2px 14px,
    linear-gradient(var(--gold), var(--gold)) top right / 14px 2px,
    linear-gradient(var(--gold), var(--gold)) top right / 2px 14px,
    linear-gradient(var(--gold), var(--gold)) bottom left / 14px 2px,
    linear-gradient(var(--gold), var(--gold)) bottom left / 2px 14px,
    linear-gradient(var(--gold), var(--gold)) bottom right / 14px 2px,
    linear-gradient(var(--gold), var(--gold)) bottom right / 2px 14px;
  background-repeat: no-repeat;
  opacity: 0.5;
}
@keyframes stage-breathe {
  0%,
  100% {
    opacity: 0.85;
  }
  50% {
    opacity: 1;
  }
}

/* 对弈状态条 */
.turn-status {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 3px;
  flex: none;
}
.live-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 10px rgba(201, 168, 106, 0.8);
  animation: live-pulse 1.6s var(--ease-out) infinite;
}
.turn-status.thinking .live-dot {
  background: var(--jade);
  box-shadow: 0 0 10px rgba(90, 168, 156, 0.8);
}
@keyframes live-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.72);
    opacity: 0.7;
  }
}
.right {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.right-title {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 10px;
  color: var(--gold);
  flex: none;
}
@media (max-width: 1180px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    overflow-y: auto;
  }
  .right {
    min-height: 420px;
  }
}
</style>