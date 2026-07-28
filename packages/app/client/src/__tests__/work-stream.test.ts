/** @vitest-environment jsdom */

import type { WorkTask, WorkTaskEvent } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkStream from '../components/work/WorkStream.vue'
import {
    useWorkStore,
    type WorkSession,
    type WorkTaskLane,
    type WorkTaskState,
} from '../stores/work'

const createdAt = '2026-07-20T12:00:00.000Z'
const runningTask: WorkTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}
const outreachTask: WorkTask = {
    ...runningTask,
    id: 'a8314bdd-2a1c-48f3-8982-a57fd8b04f5c',
    threadId: 'outreach-thread-id',
    turnId: 'outreach-turn-id',
}
const importSession = {
    kind: 'job-post-import',
    taskId: runningTask.id,
    url: 'https://example.com/job',
} satisfies WorkSession
const outreachSession = {
    kind: 'outreach-contact',
    taskId: outreachTask.id,
    postId: 'post-1',
} satisfies WorkSession
const laneContent = {
    'job-post-import': {
        taskId: importSession.taskId,
        activity: 'Reviewing the imported role.',
        action: 'Allow access for the imported role?',
    },
    outreach: {
        taskId: outreachSession.taskId,
        activity: 'Researching the outreach contact.',
        action: 'Allow access for outreach research?',
    },
} satisfies Record<WorkTaskLane, { taskId: string; activity: string; action: string }>

type WorkStore = ReturnType<typeof useWorkStore>
type TaskStateUpdate = Partial<Omit<WorkTaskState, 'taskId'>>

const createTaskState = (taskId: string, update: TaskStateUpdate = {}): WorkTaskState => ({
    taskId,
    task: null,
    events: [],
    connectionState: 'idle',
    pendingAction: null,
    alwaysAllowBrowserActions: false,
    actionSubmitting: false,
    cancelling: false,
    starting: false,
    restoring: false,
    sessionUnavailable: false,
    error: null,
    ...update,
})

function updateTaskState(store: WorkStore, taskId: string, update: TaskStateUpdate) {
    const currentState = store.taskStates[taskId]

    if (currentState === undefined) {
        throw new Error(`Missing Work task state for ${taskId}`)
    }

    store.taskStates = {
        ...store.taskStates,
        [taskId]: { ...currentState, ...update, taskId },
    }
}

function appendEvent(store: WorkStore, taskId: string, event: WorkTaskEvent) {
    const currentState = store.taskStates[taskId]

    if (currentState === undefined) {
        throw new Error(`Missing Work task state for ${taskId}`)
    }

    updateTaskState(store, taskId, { events: [...currentState.events, event] })
}

interface MountWorkStreamOptions {
    issue?: string | null
    lane?: WorkTaskLane
    sessions?: WorkSession[]
    taskStates?: Record<string, WorkTaskState>
}

describe('work stream', () => {
    const mounted: Array<{ app: ReturnType<typeof createApp>; root: HTMLElement }> = []

    function mountWorkStream({
        issue = null,
        lane = 'job-post-import',
        sessions = [importSession],
        taskStates = {
            [importSession.taskId]: createTaskState(importSession.taskId),
        },
    }: MountWorkStreamOptions = {}) {
        const pinia = createPinia()
        setActivePinia(pinia)
        const store = useWorkStore()
        store.sessions = sessions
        store.taskStates = taskStates
        const root = document.createElement('div')
        const app = createApp(WorkStream, { issue, lane })
        document.body.append(root)
        app.use(pinia)
        app.mount(root)
        mounted.push({ app, root })

        const taskId = store.getSession(lane)?.taskId

        if (taskId === undefined) {
            throw new Error(`Missing Work session for ${lane}`)
        }

        return { root, store, taskId }
    }

    afterEach(() => {
        for (const { app, root } of mounted.splice(0)) {
            app.unmount()
            root.remove()
        }
    })

    it('renders fragmented reasoning sections as clean, separate statements', async () => {
        const { root, store, taskId } = mountWorkStream()

        updateTaskState(store, taskId, {
            events: [
                { type: 'message', textDelta: '**Reviewing ', startsNewStatement: true, createdAt },
                { type: 'message', textDelta: 'the role**', startsNewStatement: false, createdAt },
                { type: 'message', textDelta: '**Finding ', startsNewStatement: true, createdAt },
                {
                    type: 'message',
                    textDelta: 'the **right** person**',
                    startsNewStatement: false,
                    createdAt,
                },
            ] satisfies WorkTaskEvent[],
        })
        await nextTick()

        expect(root.querySelectorAll('[data-testid="work-stream-commentary"]')).toHaveLength(1)
        expect(root.querySelector('[data-testid="work-stream-copy"]')?.textContent).toBe(
            'Reviewing the role\nFinding the **right** person',
        )
    })

    it.each([{ lane: 'job-post-import' }, { lane: 'outreach' }] satisfies Array<{
        lane: WorkTaskLane
    }>)(
        'isolates $lane activity and actions from simultaneous work in the other lane',
        async ({ lane }) => {
            const selected = laneContent[lane]
            const excluded =
                laneContent[lane === 'job-post-import' ? 'outreach' : 'job-post-import']
            const { root, store } = mountWorkStream({
                lane,
                sessions: [importSession, outreachSession],
                taskStates: {
                    [importSession.taskId]: createTaskState(importSession.taskId, {
                        task: runningTask,
                        events: [
                            {
                                type: 'message',
                                textDelta: laneContent['job-post-import'].activity,
                                startsNewStatement: true,
                                createdAt,
                            },
                        ],
                        pendingAction: {
                            id: 'import-action',
                            kind: 'browser-origin',
                            message: laneContent['job-post-import'].action,
                            origin: 'https://example.com',
                        },
                    }),
                    [outreachSession.taskId]: createTaskState(outreachSession.taskId, {
                        task: outreachTask,
                        events: [
                            {
                                type: 'message',
                                textDelta: laneContent.outreach.activity,
                                startsNewStatement: true,
                                createdAt,
                            },
                        ],
                        pendingAction: {
                            id: 'outreach-action',
                            kind: 'browser-origin',
                            message: laneContent.outreach.action,
                            origin: 'https://example.org',
                        },
                    }),
                },
            })
            const resolveAction = vi.spyOn(store, 'resolveAction').mockResolvedValue()

            await vi.waitFor(() => {
                expect(root.querySelector('[data-testid="work-stream-copy"]')?.textContent).toBe(
                    selected.activity,
                )
                expect(
                    root.querySelector('[data-testid="work-action-prompt"]')?.textContent,
                ).toContain(selected.action)
            })

            expect(root.textContent).not.toContain(excluded.activity)
            expect(root.textContent).not.toContain(excluded.action)

            root.querySelector<HTMLButtonElement>('[data-testid="work-action-approve"]')?.click()

            expect(resolveAction).toHaveBeenCalledExactlyOnceWith(selected.taskId, 'approve')
        },
    )

    it('replaces the latest activity icon with progress without attaching it to commentary', async () => {
        const { root, store, taskId } = mountWorkStream()
        updateTaskState(store, taskId, {
            task: runningTask,
            events: [
                { type: 'activity', message: 'Task started', createdAt },
                { type: 'activity', message: 'Using Chrome', createdAt },
                {
                    type: 'message',
                    textDelta: 'Reviewing the hiring team.',
                    startsNewStatement: true,
                    createdAt,
                },
            ],
        })
        await nextTick()

        const activityItems = root.querySelectorAll('[data-testid="work-stream-activity"]')
        const commentaryItem = root.querySelector('[data-testid="work-stream-commentary"]')
        const latestActivity = activityItems.item(activityItems.length - 1)

        expect(root.querySelectorAll('[data-testid="work-progress-indicator"]')).toHaveLength(1)
        expect(
            latestActivity.querySelector('[data-testid="work-progress-indicator"]'),
        ).not.toBeNull()
        expect(commentaryItem?.querySelector('[data-testid="work-progress-indicator"]')).toBeNull()

        appendEvent(store, taskId, {
            type: 'activity',
            message: 'Reading local context',
            createdAt,
        })
        await nextTick()

        const updatedActivityItems = root.querySelectorAll('[data-testid="work-stream-activity"]')
        const newestActivity = updatedActivityItems.item(updatedActivityItems.length - 1)

        expect(latestActivity.querySelector('[data-testid="work-progress-indicator"]')).toBeNull()
        expect(
            newestActivity.querySelector('[data-testid="work-progress-indicator"]'),
        ).not.toBeNull()
    })

    it('follows new updates until the user scrolls up and resumes at the bottom', async () => {
        const { root, store, taskId } = mountWorkStream()
        const progress = root.querySelector<HTMLElement>('[data-testid="work-progress"]')

        if (progress === null) {
            throw new Error('Could not find work progress viewport')
        }

        let scrollHeight = 180
        let scrollTop = 0
        let scrollWrites = 0

        Object.defineProperties(progress, {
            clientHeight: { configurable: true, get: () => 100 },
            scrollHeight: { configurable: true, get: () => scrollHeight },
            scrollTop: {
                configurable: true,
                get: () => scrollTop,
                set: (value: number) => {
                    scrollTop = value
                    scrollWrites += 1
                },
            },
        })

        updateTaskState(store, taskId, {
            events: [{ type: 'activity', message: 'Task started', createdAt }],
        })
        await vi.waitFor(() => expect(scrollTop).toBe(80))

        scrollTop = 20
        progress.dispatchEvent(new Event('scroll'))
        await nextTick()
        scrollHeight = 220
        appendEvent(store, taskId, {
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
        await nextTick()
        scrollHeight = 260
        appendEvent(store, taskId, {
            type: 'message',
            textDelta: ' Checking the hiring team.',
            startsNewStatement: false,
            createdAt,
        })

        await vi.waitFor(() => expect(scrollTop).toBe(160))

        const writesAtBottom = scrollWrites
        appendEvent(store, taskId, {
            type: 'activity',
            message: 'Reading local context',
            createdAt,
        })
        await nextTick()
        await nextTick()

        expect(scrollTop).toBe(160)
        expect(scrollWrites).toBe(writesAtBottom)
    })

    it('routes required actions and resets confirmation for the next action', async () => {
        const { root, store, taskId } = mountWorkStream()
        const resolveAction = vi.spyOn(store, 'resolveAction').mockResolvedValue()
        const allowBrowserActions = vi
            .spyOn(store, 'allowBrowserActionsForTask')
            .mockResolvedValue()
        updateTaskState(store, taskId, {
            task: runningTask,
            pendingAction: {
                id: 'action-1',
                kind: 'browser-origin',
                message: 'Allow access?',
                origin: 'https://example.com',
            },
        })

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="work-action-prompt"]')).toBe(
                document.activeElement,
            ),
        )

        root.querySelector<HTMLButtonElement>('[data-testid="work-action-approve"]')?.click()
        expect(resolveAction).toHaveBeenCalledExactlyOnceWith(taskId, 'approve')

        root.querySelector<HTMLButtonElement>('[data-testid="work-action-always-allow"]')?.click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="work-action-always-allow-cancel"]')).toBe(
                document.activeElement,
            ),
        )

        updateTaskState(store, taskId, {
            pendingAction: {
                id: 'action-2',
                kind: 'browser-origin',
                message: 'Allow access?',
                origin: 'https://example.org',
            },
        })
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="work-action-prompt"]')).toBe(
                document.activeElement,
            ),
        )

        root.querySelector<HTMLButtonElement>('[data-testid="work-action-always-allow"]')?.click()
        await nextTick()
        root.querySelector<HTMLButtonElement>(
            '[data-testid="work-action-always-allow-confirm"]',
        )?.click()

        expect(allowBrowserActions).toHaveBeenCalledExactlyOnceWith(taskId)
    })

    it('focuses a Work issue so the failure is announced', async () => {
        const { root } = mountWorkStream({ issue: 'Could not cancel task' })

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')).toBe(document.activeElement)
        })
    })

    it('announces reconnecting until the Work stream reconnects', async () => {
        const { root, store, taskId } = mountWorkStream()

        updateTaskState(store, taskId, { connectionState: 'reconnecting' })
        await nextTick()

        expect(
            root.querySelector('[data-testid="work-reconnect-status"]')?.getAttribute('role'),
        ).toBe('status')

        updateTaskState(store, taskId, { connectionState: 'connected' })
        await nextTick()

        expect(root.querySelector('[data-testid="work-reconnect-status"]')).toBeNull()
    })
})
