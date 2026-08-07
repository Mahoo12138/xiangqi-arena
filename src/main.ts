import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useGameStore } from './stores/gameStore'
import './style.css'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
const store = useGameStore() // 启动即实例化，触发状态还原
app.use(router)
// 等待 IndexedDB 载入当前对局后再挂载，避免首帧闪空棋盘
store.ready.then(() => app.mount('#app'))