/** @vitest-environment jsdom */

import type { AgentTask, AgentTaskEvent } from '@job-search-facilitator/core'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentStream from '../components/agent/AgentStream.vue'
import {
    useAgentStore,
    type AgentSession,
    type AgentTaskLane,
    type AgentTaskState,
} from '../stores/agent'

const createdAt = '2026-07-20T12:00:00.000Z'
const runningTask: AgentTask = {
    id: 'f67f9fe5-e502-4d28-8c72-c044f1babbb3',
    status: 'running',
    threadId: 'thread-id',
    turnId: 'turn-id',
    output: null,
    error: null,
}
const outreachTask: AgentTask = {
    ...runningTask,
    id: 'a8314bdd-2a1c-48f3-8982-a57fd8b04f5c',
    threadId: 'outreach-thread-id',
    turnId: 'outreach-turn-id',
}
const importSession = {
    kind: 'job-post-import',
    taskId: runningTask.id,
    url: 'https://example.com/job',
} satisfies AgentSession
const outreachSession = {
    kind: 'outreach-contact',
    taskId: outreachTask.id,
    postId: 'post-1',
} satisfies AgentSession
const laneContent = {
    'job-post-import': {
        taskId: importSession.taskId,
        activity: 'Reviewing the imported role.',
        permission: 'Allow access for the imported role?',
    },
    outreach: {
        taskId: outreachSession.taskId,
        activity: 'Researching the outreach contact.',
        permission: 'Allow access for outreach research?',
    },
} satisfies Record<AgentTaskLane, { taskId: string; activity: string; permission: string }>

type AgentStore = ReturnType<typeof useAgentStore>
type TaskStateUpdate = Partial<Omit<AgentTaskState, 'taskId'>>

const createTaskState = (taskId: string, update: TaskStateUpdate = {}): AgentTaskState => ({
    taskId,
    task: null,
    events: [],
    connectionState: 'idle',
    pendingPermission: null,
    alwaysAllowBrowserActions: false,
    permissionSubmitting: false,
    cancelling: false,
    starting: false,
    restoring: false,
    sessionUnavailable: false,
    error: null,
    ...update,
})

function updateTaskState(store: AgentStore, taskId: string, update: TaskStateUpdate) {
    const currentState = store.taskStates[taskId]

    if (currentState === undefined) {
        throw new Error(`Missing Agent task state for ${taskId}`)
    }

    store.taskStates = {
        ...store.taskStates,
        [taskId]: { ...currentState, ...update, taskId },
    }
}

function appendEvent(store: AgentStore, taskId: string, event: AgentTaskEvent) {
    const currentState = store.taskStates[taskId]

    if (currentState === undefined) {
        throw new Error(`Missing Agent task state for ${taskId}`)
    }

    updateTaskState(store, taskId, { events: [...currentState.events, event] })
}

interface MountAgentStreamOptions {
    issue?: string | null
    lane?: AgentTaskLane
    sessions?: AgentSession[]
    taskStates?: Record<string, AgentTaskState>
}

describe('agent stream', () => {
    const mounted: Array<{ app: ReturnType<typeof createApp>; root: HTMLElement }> = []

    function mountAgentStream({
        issue = null,
        lane = 'job-post-import',
        sessions = [importSession],
        taskStates = {
            [importSession.taskId]: createTaskState(importSession.taskId),
        },
    }: MountAgentStreamOptions = {}) {
        const pinia = createPinia()
        setActivePinia(pinia)
        const store = useAgentStore()
        store.sessions = sessions
        store.taskStates = taskStates
        const root = document.createElement('div')
        const app = createApp(AgentStream, { issue, lane })
        document.body.append(root)
        app.use(pinia)
        app.mount(root)
        mounted.push({ app, root })

        const taskId = store.getSession(lane)?.taskId

        if (taskId === undefined) {
            throw new Error(`Missing Agent session for ${lane}`)
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
        const { root, store, taskId } = mountAgentStream()

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
            ] satisfies AgentTaskEvent[],
        })
        await nextTick()

        expect(root.querySelectorAll('[data-testid="agent-stream-commentary"]')).toHaveLength(1)
        expect(root.querySelector('[data-testid="agent-stream-copy"]')?.textContent).toBe(
            'Reviewing the role\nFinding the **right** person',
        )
    })

    it.each([{ lane: 'job-post-import' }, { lane: 'outreach' }] satisfies Array<{
        lane: AgentTaskLane
    }>)(
        'isolates $lane activity and actions from simultaneous agent in the other lane',
        async ({ lane }) => {
            const selected = laneContent[lane]
            const excluded =
                laneContent[lane === 'job-post-import' ? 'outreach' : 'job-post-import']
            const { root, store } = mountAgentStream({
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
                        pendingPermission: {
                            id: 'import-permission',
                            kind: 'browser-origin',
                            message: laneContent['job-post-import'].permission,
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
                        pendingPermission: {
                            id: 'outreach-permission',
                            kind: 'browser-origin',
                            message: laneContent.outreach.permission,
                            origin: 'https://example.org',
                        },
                    }),
                },
            })
            const resolvePermission = vi.spyOn(store, 'resolvePermission').mockResolvedValue()

            await vi.waitFor(() => {
                expect(root.querySelector('[data-testid="agent-stream-copy"]')?.textContent).toBe(
                    selected.activity,
                )
                expect(
                    root.querySelector('[data-testid="agent-permission-prompt"]')?.textContent,
                ).toContain(selected.permission)
            })

            expect(root.textContent).not.toContain(excluded.activity)
            expect(root.textContent).not.toContain(excluded.permission)

            root.querySelector<HTMLButtonElement>(
                '[data-testid="agent-permission-approve"]',
            )?.click()

            expect(resolvePermission).toHaveBeenCalledExactlyOnceWith(selected.taskId, 'approve')
        },
    )

    it('replaces the latest activity icon with progress without attaching it to commentary', async () => {
        const { root, store, taskId } = mountAgentStream()
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

        const activityItems = root.querySelectorAll('[data-testid="agent-stream-activity"]')
        const commentaryItem = root.querySelector('[data-testid="agent-stream-commentary"]')
        const latestActivity = activityItems.item(activityItems.length - 1)

        expect(root.querySelectorAll('[data-testid="agent-progress-indicator"]')).toHaveLength(1)
        expect(
            latestActivity.querySelector('[data-testid="agent-progress-indicator"]'),
        ).not.toBeNull()
        expect(commentaryItem?.querySelector('[data-testid="agent-progress-indicator"]')).toBeNull()

        appendEvent(store, taskId, {
            type: 'activity',
            message: 'Reading local context',
            createdAt,
        })
        await nextTick()

        const updatedActivityItems = root.querySelectorAll('[data-testid="agent-stream-activity"]')
        const newestActivity = updatedActivityItems.item(updatedActivityItems.length - 1)

        expect(latestActivity.querySelector('[data-testid="agent-progress-indicator"]')).toBeNull()
        expect(
            newestActivity.querySelector('[data-testid="agent-progress-indicator"]'),
        ).not.toBeNull()
    })

    it('follows new updates until the user scrolls up and resumes at the bottom', async () => {
        const { root, store, taskId } = mountAgentStream()
        const progress = root.querySelector<HTMLElement>('[data-testid="agent-progress"]')

        if (progress === null) {
            throw new Error('Could not find agent progress viewport')
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

    it('routes required permissions and resets confirmation for the next permission', async () => {
        const { root, store, taskId } = mountAgentStream()
        const resolvePermission = vi.spyOn(store, 'resolvePermission').mockResolvedValue()
        const allowBrowserActions = vi
            .spyOn(store, 'allowBrowserActionsForTask')
            .mockResolvedValue()
        updateTaskState(store, taskId, {
            task: runningTask,
            pendingPermission: {
                id: 'permission-1',
                kind: 'browser-origin',
                message: 'Allow access?',
                origin: 'https://example.com',
            },
        })

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="agent-permission-prompt"]')).toBe(
                document.activeElement,
            ),
        )

        root.querySelector<HTMLButtonElement>('[data-testid="agent-permission-approve"]')?.click()
        expect(resolvePermission).toHaveBeenCalledExactlyOnceWith(taskId, 'approve')

        root.querySelector<HTMLButtonElement>(
            '[data-testid="agent-permission-always-allow"]',
        )?.click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="agent-permission-always-allow-cancel"]')).toBe(
                document.activeElement,
            ),
        )

        updateTaskState(store, taskId, {
            pendingPermission: {
                id: 'permission-2',
                kind: 'browser-origin',
                message: 'Allow access?',
                origin: 'https://example.org',
            },
        })
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="agent-permission-prompt"]')).toBe(
                document.activeElement,
            ),
        )

        root.querySelector<HTMLButtonElement>(
            '[data-testid="agent-permission-always-allow"]',
        )?.click()
        await nextTick()
        root.querySelector<HTMLButtonElement>(
            '[data-testid="agent-permission-always-allow-confirm"]',
        )?.click()

        expect(allowBrowserActions).toHaveBeenCalledExactlyOnceWith(taskId)
    })

    it('focuses an Agent issue so the failure is announced', async () => {
        const { root } = mountAgentStream({ issue: 'Could not cancel task' })

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')).toBe(document.activeElement)
        })
    })

    it('announces reconnecting until the Agent stream reconnects', async () => {
        const { root, store, taskId } = mountAgentStream()

        updateTaskState(store, taskId, { connectionState: 'reconnecting' })
        await nextTick()

        expect(
            root.querySelector('[data-testid="agent-reconnect-status"]')?.getAttribute('role'),
        ).toBe('status')

        updateTaskState(store, taskId, { connectionState: 'connected' })
        await nextTick()

        expect(root.querySelector('[data-testid="agent-reconnect-status"]')).toBeNull()
    })
})
