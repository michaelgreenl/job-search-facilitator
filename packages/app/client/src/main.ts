import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { router } from './router/index'
import App from './App.vue'
import { restorePersistedWorkSession } from '@/restore-work-session'
import { useWorkStore } from '@/stores/work'
import '@/assets/styles/app.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

void restorePersistedWorkSession(router, useWorkStore(pinia))
    .catch(() => undefined)
    .finally(() => app.mount('#app'))
