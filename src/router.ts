import { createRouter, createWebHistory } from 'vue-router'
import { useGameStore } from './stores/gameStore'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: () => import('./views/LandingView.vue') },
    { path: '/config', name: 'config', component: () => import('./views/ConfigView.vue') },
    { path: '/game', name: 'game', component: () => import('./views/GameView.vue') },
  ],
})

// 对局进行中（已走子或正在思考、已消耗 Token）离开页面时二次确认，
// 避免误操作废弃棋局。覆盖浏览器前进/后退与所有页面内跳转。
router.beforeEach((to, from) => {
  if (from.name === 'game' && to.name !== 'game') {
    const store = useGameStore()
    if (store.moveCount > 0 || store.thinking) {
      const ok = window.confirm(
        '当前棋局尚未结束，离开将废弃本局并浪费已消耗的 Token。确定离开吗？',
      )
      if (!ok) return false
    }
  }
  return true
})