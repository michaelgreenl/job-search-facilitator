/** @vitest-environment jsdom */

import type { WorkTaskEvent } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import WorkStream from '../components/work/WorkStream.vue'
import { useWorkStore } from '../stores/work.store'

const createdAt = '2026-07-20T12:00:00.000Z'

describe('work stream', () => {
    const mounted: Array<{ app: ReturnType<typeof createApp>; root: HTMLElement }> = []

    afterEach(() => {
        for (const { app, root } of mounted.splice(0)) {
            app.unmount()
            root.remove()
        }
    })

    it('renders fragmented reasoning sections as clean, separate statements', async () => {
        const pinia = createPinia()
        setActivePinia(pinia)
        const store = useWorkStore()
        const root = document.createElement('div')
        const app = createApp(WorkStream, { issue: null })
        document.body.append(root)
        app.use(pinia)
        app.mount(root)
        mounted.push({ app, root })

        store.events = [
            { type: 'message', textDelta: '**Reviewing ', startsNewStatement: true, createdAt },
            { type: 'message', textDelta: 'the role**', startsNewStatement: false, createdAt },
            { type: 'message', textDelta: '**Finding ', startsNewStatement: true, createdAt },
            {
                type: 'message',
                textDelta: 'the **right** person**',
                startsNewStatement: false,
                createdAt,
            },
        ] satisfies WorkTaskEvent[]
        await nextTick()

        expect(root.querySelectorAll('.activity-item-commentary')).toHaveLength(1)
        expect(root.querySelector('.activity-copy')?.textContent).toBe(
            'Reviewing the role\nFinding the **right** person',
        )
    })
})
