<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import type { MatchConfig } from '../types'

const router = useRouter()
const store = useGameStore()

const draft = reactive<MatchConfig>({
  red: { ...store.config.red },
  black: { ...store.config.black },
})

const models = store.models

async function save() {
  await store.createGame(JSON.parse(JSON.stringify(draft)))
  router.push('/game')
}
</script>

<template>
  <div class="config">
    <h2>配置对局 · Configure Match</h2>
    <p class="hint">红方先行。BaseUrl 与 API Key 由环境变量 <code>LLM_BASE_URL</code>/<code>LLM_API_KEY</code> 提供，经 dev server 代理转发；模型列表取自 <code>VITE_LLM_MODELS</code>（逗号分隔）。</p>

    <div class="players">
      <div class="card player red">
        <h3><span class="dot red-dot"></span> 红方 · Red</h3>
        <label>模型 Model</label>
        <select v-model="draft.red.model">
          <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
        </select>
        <label>名称 Name</label>
        <input v-model="draft.red.name" placeholder="红方" />
        <label class="row">
          <input type="checkbox" v-model="draft.red.isHuman" />
          人类操作 Human
        </label>
      </div>

      <div class="card player black">
        <h3><span class="dot blk-dot"></span> 黑方 · Black</h3>
        <label>模型 Model</label>
        <select v-model="draft.black.model">
          <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
        </select>
        <label>名称 Name</label>
        <input v-model="draft.black.name" placeholder="黑方" />
        <label class="row">
          <input type="checkbox" v-model="draft.black.isHuman" />
          人类操作 Human
        </label>
      </div>
    </div>

    <div class="actions">
      <button class="btn" @click="save">开始对局 · Start Match</button>
      <button class="btn ghost" @click="router.push('/')">返回 · Back</button>
    </div>
  </div>
</template>

<style scoped>
.config {
  max-width: 900px;
  margin: 0 auto;
}
h2 {
  margin: 0 0 4px;
  font-family: var(--font-display);
  letter-spacing: 3px;
}
.hint {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 24px;
}
.hint code {
  background: var(--panel-2);
  padding: 2px 6px;
  border-radius: 4px;
}
.players {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.player {
  position: relative;
}
.player::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
}
.player.red::before {
  background: var(--red);
}
.player.black::before {
  background: #6b7a92;
}
.player h3 {
  margin: 0 0 16px;
  font-family: var(--font-display);
  letter-spacing: 2px;
}
.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 6px;
}
.red-dot {
  background: var(--red);
}
.blk-dot {
  background: #55627a;
}
label {
  display: block;
  color: var(--muted);
  font-size: 13px;
  margin: 12px 0 4px;
}
input[type='text'],
input:not([type='checkbox']),
select {
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text);
  font-size: 14px;
  transition: border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
input:focus,
select:focus {
  outline: none;
  border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(201, 168, 106, 0.18);
}
select option {
  background: var(--panel);
  color: var(--text);
}
label.row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  margin-top: 16px;
}
.actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}
@media (max-width: 720px) {
  .players {
    grid-template-columns: 1fr;
  }
}
</style>