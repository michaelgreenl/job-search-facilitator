import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { router } from './router/index'
import App from './App.vue'
import { restorePersistedAgentSession } from '@/restore-agent-session'
import { useAgentStore } from '@/stores/agent'
import '@/assets/styles/app.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

void restorePersistedAgentSession(router, useAgentStore(pinia))
    .catch(() => undefined)
    .finally(() => app.mount('#app'))
