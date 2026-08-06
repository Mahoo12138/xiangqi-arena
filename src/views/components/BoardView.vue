<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../../stores/gameStore'
import { pieceName, sideOf } from '../../engine/board'
import type { Piece, Pos, Side } from '../../types'

const store = useGameStore()

const CELL = 50
const PAD = 12

// 棋盘为 10 条横线 × 9 条竖线。显式渲染，避免背景平铺产生的多余边线。
const H_LINES = 10
const V_LINES = 9

// 尺寸按“线段之间的间隔”计：N 条线只有 N-1 个间隔。
// 9 条竖线夹 8 个间隔（宽）；10 条横线夹 9 个间隔（高）。
const W = (V_LINES - 1) * CELL + PAD * 2
const H = (H_LINES - 1) * CELL + PAD * 2

const selected = ref<Pos | null>(null)

const humanSide = computed<Side | null>(() => {
  if (store.result) return null
  const s = store.turn
  return store.currentPlayer(s).isHuman ? s : null
})

const pieces = computed<Array<{ rank: number; file: number; piece: Piece }>>(() => {
  const out: Array<{ rank: number; file: number; piece: Piece }> = []
  for (let r = 0; r < store.board.length; r++) {
    for (let f = 0; f < store.board[r].length; f++) {
      const p = store.board[r][f]
      if (p) out.push({ rank: r, file: f, piece: p })
    }
  }
  return out
})

const legalTargets = computed<Array<{ rank: number; file: number }>>(() => {
  const s = new Set<string>()
  if (!selected.value) return []
  for (const m of store.game.legalMoveList) {
    if (m.from.rank === selected.value.rank && m.from.file === selected.value.file) {
      s.add(`${m.to.rank},${m.to.file}`)
    }
  }
  return Array.from(s).map((k) => {
    const [r, f] = k.split(',')
    return { rank: Number(r), file: Number(f) }
  })
})

function isTarget(rank: number, file: number): boolean {
  return legalTargets.value.some((t) => t.rank === rank && t.file === file)
}

function onCell(rank: number, file: number) {
  const piece = store.board[rank][file]
  if (!selected.value) {
    // 选择己方棋子
    if (piece && sideOf(piece) === humanSide.value) {
      selected.value = { rank, file }
    }
    return
  }
  if (isTarget(rank, file)) {
    const ok = store.humanMove(selected.value, { rank, file })
    if (ok) selected.value = null
    return
  }
  // 点击其他己方棋子则改选
  if (piece && sideOf(piece) === humanSide.value) {
    selected.value = { rank, file }
  } else {
    selected.value = null
  }
}
</script>

<template>
  <div class="board-wrap">
    <div class="board" :style="{ width: W + 'px', height: H + 'px' }">
      <div class="grid-lines">
        <div
          v-for="i in H_LINES"
          :key="'h' + i"
          class="h-line"
          :style="{ top: PAD + (i - 1) * CELL + 'px', left: PAD + 'px', right: PAD + 'px' }"
        ></div>
        <div
          v-for="i in V_LINES"
          :key="'v' + i"
          class="v-line"
          :style="{ left: PAD + (i - 1) * CELL + 'px', top: PAD + 'px', bottom: PAD + 'px' }"
        ></div>
      </div>
      <div class="river"><span>楚 河</span><span>漢 界</span></div>

      <div class="cells">
        <template v-for="r in 10" :key="r">
          <div
            v-for="f in 9"
            :key="f"
            class="cell"
            :style="{
              left: PAD + (f - 1) * CELL - CELL / 2 + 'px',
              top: PAD + (9 - (r - 1)) * CELL - CELL / 2 + 'px',
              width: CELL + 'px',
              height: CELL + 'px',
            }"
            @click="onCell(r - 1, f - 1)"
          ></div>
        </template>
      </div>

      <div class="marks">
        <span
          v-for="t in legalTargets"
          :key="t.rank + '-' + t.file"
          class="mark"
          :style="{
            left: PAD + t.file * CELL + CELL / 2 + 'px',
            top: PAD + (9 - t.rank) * CELL + CELL / 2 + 'px',
          }"
        ></span>
      </div>

      <div class="pieces">
        <div
          v-for="item in pieces"
          :key="item.rank + '-' + item.file"
          class="piece"
          :class="[sideOf(item.piece), { sel: selected && selected.rank === item.rank && selected.file === item.file }]"
          :style="{
            left: PAD + item.file * CELL + 'px',
            top: PAD + (9 - item.rank) * CELL + 'px',
          }"
        >
          {{ pieceName(item.piece) }}
          <small>{{ item.piece.toUpperCase() }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-wrap {
  display: flex;
  justify-content: center;
}
.board {
  position: relative;
  background:
    radial-gradient(ellipse at center, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.34)),
    linear-gradient(135deg, #e9cd8f, #dab46c);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px rgba(120, 88, 40, 0.8),
    0 0 0 5px rgba(23, 26, 31, 1),
    0 0 0 6px rgba(201, 168, 106, 0.35),
    0 1px 0 rgba(255, 255, 255, 0.12) inset,
    0 14px 40px rgba(0, 0, 0, 0.55);
}
.grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.h-line {
  position: absolute;
  height: 1px;
  background: rgba(110, 80, 36, 0.7);
}
.v-line {
  position: absolute;
  width: 1px;
  background: rgba(110, 80, 36, 0.7);
}
.river {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-58%);
  display: flex;
  justify-content: space-around;
  padding: 0 30px;
  color: rgba(120, 88, 40, 0.75);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 8px;
  pointer-events: none;
}
.cells {
  position: absolute;
  inset: 0;
  /* 交点在边缘的点击格会超出棋盘半格，裁剪到棋盘边界，避免棋盘外出现 hover 格子 */
  overflow: hidden;
}
.cell {
  position: absolute;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color var(--dur-fast) var(--ease);
}
.cell:hover {
  background: rgba(255, 255, 255, 0.1);
}
.marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.mark {
  position: absolute;
  width: 12px;
  height: 12px;
  background: rgba(224, 67, 63, 0.55);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: mark-in var(--dur-base) var(--ease-out);
}
@keyframes mark-in {
  from {
    transform: translate(-50%, -50%) scale(0.4);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}
.pieces {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.piece {
  position: absolute;
  width: 46px;
  height: 46px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  font-family: var(--font-display);
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.25) inset,
    0 3px 8px rgba(0, 0, 0, 0.45);
  border: 2px solid rgba(0, 0, 0, 0.28);
  animation: piece-in 220ms var(--ease-out);
  transition: box-shadow var(--dur-base) var(--ease);
}
@keyframes piece-in {
  from {
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}
.piece.sel {
  box-shadow:
    0 0 0 3px var(--gold),
    0 3px 8px rgba(0, 0, 0, 0.45);
}
.piece small {
  font-size: 8px;
  font-weight: 400;
  opacity: 0.7;
  margin-top: 1px;
}
.piece.red {
  background: radial-gradient(circle at 35% 30%, #f0b8a8, #b53728);
  color: #fff;
}
.piece.black {
  background: radial-gradient(circle at 35% 30%, #a9bacf, #3d4a5c);
  color: #fff;
}
</style>