import type { Router } from 'vue-router'
import type { useAgentStore } from '@/stores/agent'

type AgentStore = ReturnType<typeof useAgentStore>

export async function restorePersistedAgentSession(
    router: Router,
    agentStore: Pick<AgentStore, 'sessions' | 'restoreSessions'>,
) {
    const session = agentStore.sessions.at(-1)

    if (session === undefined) {
        return
    }

    const routeName = session.kind === 'job-post-import' ? 'review' : 'apply'

    try {
        await router.replace({ name: routeName })
    } finally {
        void agentStore.restoreSessions().catch(() => undefined)
    }
}
