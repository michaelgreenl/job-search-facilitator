import type { Router } from 'vue-router'
import type { useWorkStore } from '@/stores/work'

type WorkStore = ReturnType<typeof useWorkStore>

export async function restorePersistedWorkSession(
    router: Router,
    workStore: Pick<WorkStore, 'sessions' | 'restoreSessions'>,
) {
    const session = workStore.sessions.at(-1)

    if (session === undefined) {
        return
    }

    const routeName = session.kind === 'job-post-import' ? 'review' : 'apply'

    try {
        await router.replace({ name: routeName })
    } finally {
        void workStore.restoreSessions().catch(() => undefined)
    }
}
