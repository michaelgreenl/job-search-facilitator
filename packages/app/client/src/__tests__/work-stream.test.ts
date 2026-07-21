/** @vitest-environment jsdom */

import type { WorkTask, WorkTaskEvent } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkStream from '../components/work/WorkStream.vue'
import { useWorkStore } from '../stores/work.store'

const createdAt = '2026-07-20T12:00:00.000Z'
const runningTask: WorkTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}

describe('work stream', () => {
    const mounted: Array<{ app: ReturnType<typeof createApp>; root: HTMLElement }> = []

    function mountWorkStream() {
        const pinia = createPinia()
        setActivePinia(pinia)
        const store = useWorkStore()
        const root = document.createElement('div')
        const app = createApp(WorkStream, { issue: null })
        document.body.append(root)
        app.use(pinia)
        app.mount(root)
        mounted.push({ app, root })

        return { root, store }
    }

    afterEach(() => {
        for (const { app, root } of mounted.splice(0)) {
            app.unmount()
            root.remove()
        }
    })

    it('renders fragmented reasoning sections as clean, separate statements', async () => {
        const { root, store } = mountWorkStream()

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

    it('replaces the latest activity icon with progress without attaching it to commentary', async () => {
        const { root, store } = mountWorkStream()
        store.task = runningTask
        store.events = [
            { type: 'activity', message: 'Task started', createdAt },
            { type: 'activity', message: 'Using Chrome', createdAt },
            {
                type: 'message',
                textDelta: 'Reviewing the hiring team.',
                startsNewStatement: true,
                createdAt,
            },
        ]
        await nextTick()

        const activityItems = root.querySelectorAll('.activity-item-activity')
        const commentaryItem = root.querySelector('.activity-item-commentary')
        const latestActivity = activityItems.item(activityItems.length - 1)

        expect(root.querySelectorAll('.activity-progress')).toHaveLength(1)
        expect(latestActivity.querySelector('.activity-progress')).not.toBeNull()
        expect(latestActivity.querySelector('.activity-icon')).toBeNull()
        expect(commentaryItem?.querySelector('.activity-progress')).toBeNull()
        expect(commentaryItem?.querySelector('.activity-icon-agent')).not.toBeNull()

        store.events.push({ type: 'activity', message: 'Reading local context', createdAt })
        await nextTick()

        const updatedActivityItems = root.querySelectorAll('.activity-item-activity')
        const newestActivity = updatedActivityItems.item(updatedActivityItems.length - 1)

        expect(latestActivity.querySelector('.activity-progress')).toBeNull()
        expect(latestActivity.querySelector('.activity-icon-globe')).not.toBeNull()
        expect(newestActivity.querySelector('.activity-progress')).not.toBeNull()
    })

    it('follows new updates until the user scrolls up and resumes at the bottom', async () => {
        const { root, store } = mountWorkStream()
        const progress = root.querySelector<HTMLElement>('.work-progress')

        if (progress === null) {
            throw new Error('Could not find work progress viewport')
        }

        let scrollHeight = 180
        let scrollTop = 0

        Object.defineProperties(progress, {
            clientHeight: { configurable: true, get: () => 100 },
            scrollHeight: { configurable: true, get: () => scrollHeight },
            scrollTop: {
                configurable: true,
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value
                },
            },
        })

        store.events = [{ type: 'activity', message: 'Task started', createdAt }]
        await vi.waitFor(() => expect(scrollTop).toBe(80))

        scrollTop = 20
        progress.dispatchEvent(new Event('scroll'))
        scrollHeight = 220
        store.events.push({
            type: 'message',
            textDelta: 'Reviewing the role.',
            startsNewStatement: true,
            createdAt,
        })
        await nextTick()
        await nextTick()

        expect(scrollTop).toBe(20)

        scrollTop = 120
        progress.dispatchEvent(new Event('scroll'))
        scrollHeight = 260
        store.events.push({
            type: 'message',
            textDelta: ' Checking the hiring team.',
            startsNewStatement: false,
            createdAt,
        })

        await vi.waitFor(() => expect(scrollTop).toBe(160))
    })
})
