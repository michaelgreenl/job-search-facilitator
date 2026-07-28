import type { Router } from 'vue-router'
import type { useWorkStore } from '@/stores/work.store'

type WorkStore = ReturnType<typeof useWorkStore>

export async function restorePersistedWorkSession(
    router: Router,
    workStore: Pick<WorkStore, 'session' | 'restoreSession'>,
) {
    const session = workStore.session

    if (session === null) {
        return
    }

    const routeName = session.kind === 'job-post-import' ? 'review' : 'apply'

    try {
        await router.replace({ name: routeName })
    } finally {
        void workStore.restoreSession().catch(() => undefined)
    }
}
