import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { router } from './router/index'
import App from './App.vue'
import '@/assets/styles/app.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
