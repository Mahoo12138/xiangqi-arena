<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()

const FEATURES = [
  {
    no: '壹',
    title: '规则引擎',
    en: 'Engine',
    desc: '自研中国象棋走子引擎，支持完整合法走法生成、将军/将死/困毙判定与中英记谱。',
  },
  {
    no: '贰',
    title: '流式思考',
    en: 'Streaming',
    desc: 'SSE 流式输出，实时捕获推理模型的思考过程与 Token 统计。',
  },
  {
    no: '叁',
    title: '代理转发',
    en: 'Proxy',
    desc: 'API Key 由 dev server 注入，走 /api 代理，不暴露到浏览器。',
  },
]
</script>

<template>
  <div class="landing">
    <div class="hero">
      <div class="hero-inner">
        <span class="seal">弈</span>
        <h1>
          <span class="zh">弈 境</span>
          <span class="sub">中国象棋 · 大模型竞技场</span>
        </h1>
        <p class="lead">
          让两个大语言模型在棋盘上对弈，
          实时观察它们的思考过程、走法记谱与 Token 消耗。
        </p>
        <p class="lead en">Two large language models battle on the Xiangqi board — reasoning, notation and token usage, live.</p>
        <div class="actions">
          <button class="btn" @click="router.push('/config')">配置对局 · Configure</button>
          <button class="btn ghost" @click="router.push('/game')">直接开局 · Quick Start</button>
        </div>
      </div>
    </div>

    <div class="features">
      <div v-for="f in FEATURES" :key="f.no" class="card feat">
        <div class="feat-head">
          <span class="feat-no">{{ f.no }}</span>
          <h3>{{ f.title }}<em>{{ f.en }}</em></h3>
        </div>
        <p>{{ f.desc }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.landing {
  max-width: 1000px;
  margin: 0 auto;
}
.hero {
  position: relative;
  text-align: center;
  padding: 72px 0 48px;
}
/* 底部淡淡巨字「棋」，作墨韵衬底 */
.hero::after {
  content: '棋';
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%);
  font-family: var(--font-display);
  font-size: 190px;
  font-weight: 800;
  color: rgba(234, 227, 210, 0.035);
  pointer-events: none;
  user-select: none;
}
.hero-inner {
  position: relative;
  z-index: 1;
}
.seal {
  display: inline-grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 10px;
  background: var(--vermilion);
  color: var(--paper);
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
  box-shadow:
    0 6px 24px rgba(200, 64, 46, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.12) inset;
  animation: rise-in var(--dur-slow) var(--ease-out) both;
}
.hero h1 {
  margin: 18px 0 6px;
  animation: rise-in var(--dur-slow) var(--ease-out) both;
  animation-delay: 60ms;
}
.zh {
  display: block;
  font-family: var(--font-display);
  font-size: 64px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 20px;
  text-indent: 20px;
  color: var(--paper);
}
.sub {
  display: block;
  margin-top: 14px;
  color: var(--gray-ink);
  font-size: 15px;
  letter-spacing: 6px;
}
.lead {
  color: var(--gray-ink);
  font-size: 16px;
  max-width: 620px;
  margin: 18px auto 4px;
  line-height: 1.8;
}
.lead.en {
  font-size: 13px;
  letter-spacing: 1px;
  opacity: 0.8;
}
.actions {
  margin-top: 30px;
  display: flex;
  gap: 14px;
  justify-content: center;
  animation: rise-in var(--dur-slow) var(--ease-out) both;
  animation-delay: 180ms;
}
@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.feat {
  position: relative;
  overflow: hidden;
  transition:
    transform var(--dur-base) var(--ease-out),
    border-color var(--dur-base) var(--ease),
    background-color var(--dur-base) var(--ease);
}
.feat:hover {
  transform: translateY(-4px);
  border-color: rgba(201, 168, 106, 0.45);
  background-color: var(--panel-2);
}
.feat-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 10px;
}
.feat-no {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(200, 64, 46, 0.14);
  color: var(--vermilion);
  border: 1px solid rgba(200, 64, 46, 0.35);
  font-family: var(--font-display);
  font-size: 16px;
}
.feat h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--paper);
}
.feat h3 em {
  margin-left: 8px;
  font-style: normal;
  font-family: var(--font-hud);
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--gold);
}
.feat p {
  color: var(--gray-ink);
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
}
</style>