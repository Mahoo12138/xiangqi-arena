import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useGameStore } from './stores/gameStore'
import './style.css'

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
useGameStore() // 启动即实例化，触发状态还原与持久化监听
app.use(router)
app.mount('#app')