import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { router } from './router/index'
import App from './App.vue'
import '@/assets/styles/app.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.mount('#app')
