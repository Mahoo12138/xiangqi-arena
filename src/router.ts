import { createRouter, createWebHistory } from 'vue-router'
import { useGameStore } from './stores/gameStore'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: () => import('./views/LandingView.vue') },
    { path: '/config', name: 'config', component: () => import('./views/ConfigView.vue') },
    { path: '/game', name: 'game', component: () => import('./views/GameView.vue') },
    { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue') },
  ],
})

// 对局进行中（已走子或正在思考、已消耗 Token）离开页面时二次确认，
// 确认离开后暂停对局并中止在途 AI 请求，避免后台继续消耗 Token。
// 覆盖浏览器前进/后退与所有页面内跳转。
router.beforeEach((to, from) => {
  if (from.name === 'game' && to.name !== 'game') {
    const store = useGameStore()
    if (store.moveCount > 0 || store.thinking) {
      const ok = window.confirm(
        '当前棋局尚未结束，离开将暂停对局并中止正在进行的这一步（已消耗的 Token 无法挽回）。确定离开吗？',
      )
      if (!ok) return false
      store.abortAndPause()
    }
  }
  return true
})