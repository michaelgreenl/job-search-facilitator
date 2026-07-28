import {
    parseWorkHealth,
    parseWorkTask,
    parseWorkTaskEvent,
    type RuntimeParser,
    type StartWorkTaskInput,
    type WorkActionDecision,
    type WorkActionRequired,
    type WorkTask,
    type WorkTaskEvent,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { parseJsonResponse } from '@/api'

type WorkConnectionState =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'closed'

export type WorkSessionOwner =
    | { kind: 'job-post-import'; url: string }
    | { kind: 'outreach-contact'; postId: string }
    | {
          kind: 'outreach-draft'
          postId: string
          contactId: string
          draft: string
          request: string
      }

export type WorkSession = WorkSessionOwner & { taskId: string }

const workSessionStorageKey = 'job-search-facilitator:work-session'

const getSessionStorage = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage)

const isNonBlankString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0

const parseWorkSession = (value: unknown): WorkSession | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }

    const session = value as Record<string, unknown>

    if (!isNonBlankString(session.taskId) || !isNonBlankString(session.kind)) {
        return null
    }

    if (session.kind === 'job-post-import' && isNonBlankString(session.url)) {
        return {
            kind: session.kind,
            taskId: session.taskId,
            url: session.url,
        }
    }

    if (session.kind === 'outreach-contact' && isNonBlankString(session.postId)) {
        return {
            kind: session.kind,
            taskId: session.taskId,
            postId: session.postId,
        }
    }

    if (
        session.kind === 'outreach-draft' &&
        isNonBlankString(session.postId) &&
        isNonBlankString(session.contactId) &&
        typeof session.draft === 'string' &&
        isNonBlankString(session.request)
    ) {
        return {
            kind: session.kind,
            taskId: session.taskId,
            postId: session.postId,
            contactId: session.contactId,
            draft: session.draft,
            request: session.request,
        }
    }

    return null
}

const readWorkSession = (): WorkSession | null => {
    const storage = getSessionStorage()

    if (storage === null) {
        return null
    }

    const removeStoredSession = () => {
        try {
            storage.removeItem(workSessionStorageKey)
        } catch {
            // Storage may be unavailable even when the browser exposes the API.
        }
    }

    try {
        const stored = storage.getItem(workSessionStorageKey)

        if (stored === null) {
            return null
        }

        const value: unknown = JSON.parse(stored)

        if (
            typeof value !== 'object' ||
            value === null ||
            Array.isArray(value) ||
            !('version' in value) ||
            value.version !== 1 ||
            !('session' in value)
        ) {
            removeStoredSession()
            return null
        }

        const session = parseWorkSession(value.session)

        if (session === null) {
            removeStoredSession()
        }

        return session
    } catch {
        removeStoredSession()
        return null
    }
}

const writeWorkSession = (session: WorkSession | null) => {
    const storage = getSessionStorage()

    if (storage === null) {
        return
    }

    try {
        if (session === null) {
            storage.removeItem(workSessionStorageKey)
        } else {
            storage.setItem(workSessionStorageKey, JSON.stringify({ version: 1, session }))
        }
    } catch {
        // A storage failure must not prevent the task from remaining usable in memory.
    }
}

const workBridgeUrl = (import.meta.env.VITE_WORK_BRIDGE_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
)

class WorkRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message)
    }
}

const workResponse = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${workBridgeUrl}${path}`, init)

    if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const message =
            typeof body === 'object' &&
            body !== null &&
            !Array.isArray(body) &&
            'error' in body &&
            typeof body.error === 'string'
                ? body.error
                : null

        throw new WorkRequestError(
            message ?? `Work request failed (${response.status})`,
            response.status,
        )
    }

    return response
}

const requestWork = async <T>(
    path: string,
    parser: RuntimeParser<T>,
    init?: RequestInit,
): Promise<T> => {
    const response = await workResponse(path, init)

    return parseJsonResponse(response, parser, `Work ${path}`)
}

const sendWork = async (path: string, init?: RequestInit): Promise<void> => {
    await workResponse(path, init)
}

export const useWorkStore = defineStore('work', () => {
    const task = shallowRef<WorkTask | null>(null)
    const session = shallowRef<WorkSession | null>(readWorkSession())
    const events = ref<WorkTaskEvent[]>([])
    const connectionState = shallowRef<WorkConnectionState>('idle')
    const pendingAction = shallowRef<WorkActionRequired | null>(null)
    const alwaysAllowBrowserActions = shallowRef(false)
    const actionSubmitting = shallowRef(false)
    const cancelling = shallowRef(false)
    const starting = shallowRef(false)
    const restoring = shallowRef(false)
    const sessionUnavailable = shallowRef(false)
    const error = shallowRef<string | null>(null)
    const taskActive = computed(
        () =>
            starting.value ||
            task.value?.status === 'running' ||
            (session.value !== null && task.value === null && !sessionUnavailable.value),
    )
    const canDismissSession = computed(
        () =>
            session.value !== null &&
            (sessionUnavailable.value || (task.value !== null && task.value.status !== 'running')),
    )
    const actionNeedsAttention = computed(
        () => pendingAction.value !== null && !alwaysAllowBrowserActions.value,
    )
    let eventSource: EventSource | null = null
    let restorePromise: Promise<WorkTask | null> | null = null

    function saveSession(nextSession: WorkSession | null) {
        session.value = nextSession
        writeWorkSession(nextSession)
    }

    function resetReplayState() {
        events.value = []
        pendingAction.value = null
        actionSubmitting.value = false
    }

    function resetVolatileTaskState() {
        task.value = null
        resetReplayState()
        alwaysAllowBrowserActions.value = false
        cancelling.value = false
        sessionUnavailable.value = false
        error.value = null
    }

    function closeConnection(state: WorkConnectionState) {
        eventSource?.close()
        eventSource = null
        connectionState.value = state
    }

    function finishTask(currentTask: WorkTask) {
        task.value = currentTask
        pendingAction.value = null
        alwaysAllowBrowserActions.value = false
        actionSubmitting.value = false
        cancelling.value = false
        sessionUnavailable.value = false
        error.value = null
        closeConnection('closed')
    }

    function disconnectConnectedTask(taskId: string, message: string) {
        const currentTask = task.value

        if (currentTask?.id === taskId && currentTask.status === 'running') {
            error.value = message
            closeConnection('disconnected')
        }
    }

    function connect(taskId: string) {
        const source = new EventSource(
            `${workBridgeUrl}/tasks/${encodeURIComponent(taskId)}/events`,
        )
        eventSource = source

        source.onopen = () => {
            if (eventSource === source) {
                connectionState.value = 'connected'
            }
        }

        source.onmessage = ({ data }) => {
            if (eventSource !== source) {
                return
            }

            try {
                if (typeof data !== 'string') {
                    throw new Error()
                }

                const value: unknown = JSON.parse(data)
                const event = parseWorkTaskEvent(value)

                events.value.push(event)

                if (event.type === 'action-required') {
                    pendingAction.value = event.action
                    actionSubmitting.value = false
                    error.value = null

                    if (alwaysAllowBrowserActions.value) {
                        void allowBrowserActionsForTask().catch(() => undefined)
                    }
                } else if (
                    event.type === 'action-resolved' &&
                    pendingAction.value?.id === event.actionId
                ) {
                    pendingAction.value = null
                    actionSubmitting.value = false
                    error.value = null
                } else if (event.type === 'completed' && task.value !== null) {
                    finishTask({
                        id: task.value.id,
                        threadId: task.value.threadId,
                        turnId: task.value.turnId,
                        status: 'completed',
                        output: event.output,
                        error: null,
                    })
                } else if (event.type === 'failed' && task.value !== null) {
                    finishTask({
                        id: task.value.id,
                        threadId: task.value.threadId,
                        turnId: task.value.turnId,
                        status: 'failed',
                        output: null,
                        error: event.error,
                    })
                } else if (event.type === 'cancelled' && task.value !== null) {
                    finishTask({
                        ...task.value,
                        status: 'cancelled',
                        output: null,
                        error: null,
                    })
                }
            } catch {
                disconnectConnectedTask(taskId, 'Work stream returned invalid data')
            }
        }

        source.onerror = () => {
            if (eventSource !== source) {
                return
            }

            if (source.readyState === EventSource.CLOSED) {
                disconnectConnectedTask(taskId, 'Work stream closed before the task finished')
            } else {
                connectionState.value = 'reconnecting'
            }
        }
    }

    const ownersMatch = (left: WorkSession, right: WorkSessionOwner) => {
        if (left.kind !== right.kind) {
            return false
        }

        if (left.kind === 'job-post-import' && right.kind === 'job-post-import') {
            return left.url === right.url
        }

        if (left.kind === 'outreach-contact' && right.kind === 'outreach-contact') {
            return left.postId === right.postId
        }

        return (
            left.kind === 'outreach-draft' &&
            right.kind === 'outreach-draft' &&
            left.postId === right.postId &&
            left.contactId === right.contactId &&
            left.draft === right.draft &&
            left.request === right.request
        )
    }

    async function startTask(input: StartWorkTaskInput, owner?: WorkSessionOwner) {
        const previousTask = task.value
        const currentSession = session.value
        closeConnection('connecting')
        resetVolatileTaskState()
        starting.value = true

        const taskId =
            owner === undefined
                ? null
                : currentSession !== null &&
                    previousTask === null &&
                    ownersMatch(currentSession, owner)
                  ? currentSession.taskId
                  : crypto.randomUUID()

        if (owner !== undefined && taskId !== null) {
            saveSession({ ...owner, taskId } as WorkSession)
        }

        let taskRequestStarted = false

        try {
            const health = await requestWork('/health', parseWorkHealth)

            const unavailableCapability = input.capabilities.find(
                (capability) => !health.capabilities.includes(capability),
            )

            if (unavailableCapability !== undefined) {
                throw new Error(`Work capability is unavailable: ${unavailableCapability}`)
            }

            const path = taskId === null ? '/tasks' : `/tasks/${encodeURIComponent(taskId)}`
            taskRequestStarted = true
            task.value = await requestWork(path, parseWorkTask, {
                method: taskId === null ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            })

            if (taskId !== null && task.value.id !== taskId) {
                throw new Error('Work returned a different task than the reserved session')
            }

            sessionUnavailable.value = false
            connect(task.value.id)

            return task.value
        } catch (requestError) {
            if (
                owner !== undefined &&
                (!taskRequestStarted || requestError instanceof WorkRequestError)
            ) {
                sessionUnavailable.value = true
            }

            error.value =
                requestError instanceof Error ? requestError.message : 'Could not start Work task'
            closeConnection('disconnected')
            throw requestError
        } finally {
            starting.value = false
        }
    }

    async function restoreSession() {
        const currentSession = session.value

        if (currentSession === null) {
            return null
        }

        if (task.value?.id === currentSession.taskId) {
            if (task.value.status === 'running' && eventSource === null) {
                resetReplayState()
                error.value = null
                closeConnection('connecting')
                connect(task.value.id)
            }

            return task.value
        }

        if (restorePromise !== null) {
            return restorePromise
        }

        const restore = async () => {
            closeConnection('connecting')
            resetVolatileTaskState()
            restoring.value = true

            try {
                const currentTask = await requestWork(
                    `/tasks/${encodeURIComponent(currentSession.taskId)}`,
                    parseWorkTask,
                )

                if (session.value?.taskId !== currentSession.taskId) {
                    return null
                }

                task.value = currentTask
                connect(currentTask.id)
                return currentTask
            } catch (requestError) {
                if (session.value?.taskId === currentSession.taskId) {
                    sessionUnavailable.value =
                        requestError instanceof WorkRequestError && requestError.status === 404
                    error.value =
                        requestError instanceof Error
                            ? requestError.message
                            : 'Could not restore Work task'
                    closeConnection('disconnected')
                }

                throw requestError
            } finally {
                restoring.value = false
            }
        }

        restorePromise = restore().finally(() => {
            restorePromise = null
        })

        return restorePromise
    }

    function dismissSession() {
        if (!canDismissSession.value) {
            return false
        }

        closeConnection('idle')
        resetVolatileTaskState()
        saveSession(null)
        return true
    }

    async function resolveAction(decision: WorkActionDecision) {
        const currentTask = task.value
        const currentAction = pendingAction.value

        if (currentTask === null || currentAction === null || actionSubmitting.value) {
            return
        }

        actionSubmitting.value = true
        error.value = null

        try {
            await sendWork(`/tasks/${currentTask.id}/actions/${currentAction.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision }),
            })
        } catch (requestError) {
            if (task.value?.id === currentTask.id && pendingAction.value?.id === currentAction.id) {
                error.value =
                    requestError instanceof Error
                        ? requestError.message
                        : 'Could not resolve Work action'
                actionSubmitting.value = false
            }

            throw requestError
        }
    }

    async function allowBrowserActionsForTask() {
        const taskId = task.value?.id
        const actionId = pendingAction.value?.id

        if (
            task.value?.status !== 'running' ||
            taskId === undefined ||
            actionId === undefined ||
            actionSubmitting.value
        ) {
            return
        }

        alwaysAllowBrowserActions.value = true

        try {
            await resolveAction('approve')
        } catch (requestError) {
            if (task.value?.id === taskId && pendingAction.value?.id === actionId) {
                alwaysAllowBrowserActions.value = false
            }

            throw requestError
        }
    }

    async function cancelTask() {
        const taskId =
            task.value?.status === 'running' ? task.value.id : (session.value?.taskId ?? null)

        if (taskId === null || cancelling.value) {
            return task.value
        }

        cancelling.value = true
        error.value = null

        try {
            const currentTask = await requestWork(
                `/tasks/${encodeURIComponent(taskId)}/cancel`,
                parseWorkTask,
                {
                    method: 'POST',
                },
            )

            if (currentTask.status !== 'running') {
                finishTask(currentTask)
            } else {
                task.value = currentTask
            }

            return currentTask
        } catch (requestError) {
            if (requestError instanceof WorkRequestError && requestError.status === 404) {
                sessionUnavailable.value = true
            }

            error.value =
                requestError instanceof Error ? requestError.message : 'Could not cancel Work task'
            throw requestError
        } finally {
            cancelling.value = false
        }
    }

    return {
        task,
        session,
        events,
        connectionState,
        taskActive,
        canDismissSession,
        pendingAction,
        alwaysAllowBrowserActions,
        actionNeedsAttention,
        actionSubmitting,
        cancelling,
        starting,
        restoring,
        sessionUnavailable,
        error,
        startTask,
        restoreSession,
        dismissSession,
        resolveAction,
        allowBrowserActionsForTask,
        cancelTask,
    }
})
