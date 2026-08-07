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

// 页面跳转规则：
// - 已有当前局时，配置页（/config）用来新建一局，会覆盖当前局，因此禁止进入，重定向回 /game。
// - 离开对局页时自动保存当前局；仅当 AI 在途（会丢本步 Token）时才二次确认。
router.beforeEach(async (to, from) => {
  const store = useGameStore()

  if (to.name === 'config' && store.activeGameId) {
    return { name: 'game' }
  }

  if (from.name === 'game' && to.name !== 'game') {
    if (store.thinking) {
      const ok = window.confirm(
        'AI 正在思考，离开将中止这一步（已消耗的 Token 无法挽回），棋局会自动保存。确定离开吗？',
      )
      if (!ok) return false
    }
    await store.leaveGame()
  }

  return true
})