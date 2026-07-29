import {
    parseAgentHealth,
    parseAgentTask,
    parseAgentTaskEvent,
    type RuntimeParser,
    type StartAgentTaskInput,
    type AgentPermissionDecision,
    type AgentPermissionRequired,
    type AgentTask,
    type AgentTaskEvent,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { parseJsonResponse } from '@/api'

export type AgentConnectionState =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'closed'

export type AgentTaskLane = 'job-post-import' | 'outreach'

export type AgentSessionOwner =
    | { kind: 'job-post-import'; url: string }
    | { kind: 'outreach-contact'; postId: string }
    | {
          kind: 'outreach-draft'
          postId: string
          contactId: string
          draft: string
          request: string
      }

export type AgentSession = AgentSessionOwner & { taskId: string }

export interface AgentTaskState {
    taskId: string
    task: AgentTask | null
    events: AgentTaskEvent[]
    connectionState: AgentConnectionState
    pendingAction: AgentPermissionRequired | null
    alwaysAllowBrowserActions: boolean
    actionSubmitting: boolean
    cancelling: boolean
    starting: boolean
    restoring: boolean
    sessionUnavailable: boolean
    error: string | null
}

const agentSessionStorageKey = 'job-search-facilitator:agent-session'

export const getAgentTaskLane = (owner: AgentSessionOwner): AgentTaskLane =>
    owner.kind === 'job-post-import' ? 'job-post-import' : 'outreach'

const createTaskState = (taskId: string): AgentTaskState => ({
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
})

const getSessionStorage = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage)

const isNonBlankString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0

const parseAgentSession = (value: unknown): AgentSession | null => {
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

const parseStoredSessions = (value: unknown): AgentSession[] | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }

    if ('version' in value && value.version === 1 && 'session' in value) {
        const session = parseAgentSession(value.session)
        return session === null ? null : [session]
    }

    if (!('version' in value) || value.version !== 2 || !('sessions' in value)) {
        return null
    }

    if (!Array.isArray(value.sessions)) {
        return null
    }

    const validSessions = value.sessions
        .map(parseAgentSession)
        .filter((session): session is AgentSession => session !== null)

    if (value.sessions.length > 0 && validSessions.length === 0) {
        return null
    }

    const taskIds = new Set(validSessions.map(({ taskId }) => taskId))
    const lanes = new Set(validSessions.map(getAgentTaskLane))

    return taskIds.size === validSessions.length && lanes.size === validSessions.length
        ? validSessions
        : null
}

const readAgentSessions = (): AgentSession[] => {
    const storage = getSessionStorage()

    if (storage === null) {
        return []
    }

    const removeStoredSessions = () => {
        try {
            storage.removeItem(agentSessionStorageKey)
        } catch {
            // Storage may be unavailable even when the browser exposes the API.
        }
    }

    try {
        const stored = storage.getItem(agentSessionStorageKey)

        if (stored === null) {
            return []
        }

        const sessions = parseStoredSessions(JSON.parse(stored))

        if (sessions === null) {
            removeStoredSessions()
            return []
        }

        return sessions
    } catch {
        removeStoredSessions()
        return []
    }
}

const writeAgentSessions = (sessions: AgentSession[]) => {
    const storage = getSessionStorage()

    if (storage === null) {
        return
    }

    try {
        if (sessions.length === 0) {
            storage.removeItem(agentSessionStorageKey)
        } else {
            storage.setItem(agentSessionStorageKey, JSON.stringify({ version: 2, sessions }))
        }
    } catch {
        // A storage failure must not prevent tasks from remaining usable in memory.
    }
}

const ownersMatch = (left: AgentSession, right: AgentSessionOwner) => {
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

const taskStateActive = (state: AgentTaskState) =>
    state.starting ||
    state.restoring ||
    state.task?.status === 'running' ||
    (state.task === null && state.error === null && !state.sessionUnavailable)

const taskStateCanDismiss = (state: AgentTaskState) =>
    !state.starting &&
    !state.restoring &&
    (state.sessionUnavailable ||
        (state.task === null && state.error !== null) ||
        (state.task !== null && state.task.status !== 'running'))

const agentBridgeUrl = (import.meta.env.VITE_AGENT_BRIDGE_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
)

class AgentRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message)
    }
}

const agentResponse = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${agentBridgeUrl}${path}`, init)

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

        throw new AgentRequestError(
            message ?? `Agent request failed (${response.status})`,
            response.status,
        )
    }

    return response
}

const requestAgent = async <T>(
    path: string,
    parser: RuntimeParser<T>,
    init?: RequestInit,
): Promise<T> => {
    const response = await agentResponse(path, init)

    return parseJsonResponse(response, parser, `Agent ${path}`)
}

const sendAgent = async (path: string, init?: RequestInit): Promise<void> => {
    await agentResponse(path, init)
}

const assertTaskIdentity = (task: AgentTask, taskId: string) => {
    if (task.id !== taskId) {
        throw new Error('Agent returned a different task than the reserved session')
    }
}

export const useAgentStore = defineStore('agent', () => {
    const initialSessions = readAgentSessions()
    const sessions = shallowRef<AgentSession[]>(initialSessions)
    const taskStates = shallowRef<Record<string, AgentTaskState>>(
        Object.fromEntries(
            initialSessions.map(({ taskId }) => [taskId, createTaskState(taskId)] as const),
        ),
    )
    const eventSources = new Map<string, EventSource>()
    const restorePromises = new Map<string, Promise<AgentTask | null>>()

    function getSession(lane: AgentTaskLane) {
        return sessions.value.find((session) => getAgentTaskLane(session) === lane) ?? null
    }

    function getTaskState(taskId: string) {
        return taskStates.value[taskId] ?? null
    }

    function updateTaskState(
        taskId: string,
        update: Partial<AgentTaskState> | ((state: AgentTaskState) => AgentTaskState),
    ) {
        const state = taskStates.value[taskId]

        if (state === undefined) {
            return null
        }

        const nextState =
            typeof update === 'function' ? update(state) : { ...state, ...update, taskId }
        taskStates.value = { ...taskStates.value, [taskId]: nextState }
        return nextState
    }

    function setTaskState(state: AgentTaskState) {
        taskStates.value = { ...taskStates.value, [state.taskId]: state }
    }

    function removeTaskState(taskId: string) {
        const nextStates = { ...taskStates.value }
        delete nextStates[taskId]
        taskStates.value = nextStates
    }

    function saveSession(nextSession: AgentSession) {
        const lane = getAgentTaskLane(nextSession)
        sessions.value = [
            ...sessions.value.filter((session) => getAgentTaskLane(session) !== lane),
            nextSession,
        ]
        writeAgentSessions(sessions.value)
    }

    function removeSession(taskId: string) {
        sessions.value = sessions.value.filter((session) => session.taskId !== taskId)
        writeAgentSessions(sessions.value)
    }

    function closeConnection(taskId: string, connectionState: AgentConnectionState) {
        eventSources.get(taskId)?.close()
        eventSources.delete(taskId)
        updateTaskState(taskId, { connectionState })
    }

    function finishTask(currentTask: AgentTask) {
        updateTaskState(currentTask.id, {
            task: currentTask,
            pendingAction: null,
            alwaysAllowBrowserActions: false,
            actionSubmitting: false,
            cancelling: false,
            sessionUnavailable: false,
            error: null,
        })
        closeConnection(currentTask.id, 'closed')
    }

    function disconnectConnectedTask(taskId: string, message: string) {
        const state = getTaskState(taskId)

        if (state?.task?.status === 'running') {
            updateTaskState(taskId, { error: message })
            closeConnection(taskId, 'disconnected')
        }
    }

    function connect(taskId: string) {
        closeConnection(taskId, 'connecting')
        const source = new EventSource(
            `${agentBridgeUrl}/tasks/${encodeURIComponent(taskId)}/events`,
        )
        eventSources.set(taskId, source)

        source.onopen = () => {
            if (eventSources.get(taskId) === source) {
                updateTaskState(taskId, { connectionState: 'connected' })
            }
        }

        source.onmessage = ({ data }) => {
            if (eventSources.get(taskId) !== source) {
                return
            }

            try {
                if (typeof data !== 'string') {
                    throw new Error()
                }

                const value: unknown = JSON.parse(data)
                const event = parseAgentTaskEvent(value)
                const state = updateTaskState(taskId, (currentState) => ({
                    ...currentState,
                    events: [...currentState.events, event],
                }))

                if (state === null) {
                    return
                }

                if (event.type === 'action-required') {
                    updateTaskState(taskId, {
                        pendingAction: event.action,
                        actionSubmitting: false,
                        error: null,
                    })

                    if (state.alwaysAllowBrowserActions) {
                        void allowBrowserActionsForTask(taskId).catch(() => undefined)
                    }
                } else if (
                    event.type === 'action-resolved' &&
                    state.pendingAction?.id === event.actionId
                ) {
                    updateTaskState(taskId, {
                        pendingAction: null,
                        actionSubmitting: false,
                        error: null,
                    })
                } else if (event.type === 'completed' && state.task !== null) {
                    finishTask({
                        id: state.task.id,
                        threadId: state.task.threadId,
                        turnId: state.task.turnId,
                        status: 'completed',
                        output: event.output,
                        error: null,
                    })
                } else if (event.type === 'failed' && state.task !== null) {
                    finishTask({
                        id: state.task.id,
                        threadId: state.task.threadId,
                        turnId: state.task.turnId,
                        status: 'failed',
                        output: null,
                        error: event.error,
                    })
                } else if (event.type === 'cancelled' && state.task !== null) {
                    finishTask({
                        ...state.task,
                        status: 'cancelled',
                        output: null,
                        error: null,
                    })
                }
            } catch {
                disconnectConnectedTask(taskId, 'Agent stream returned invalid data')
            }
        }

        source.onerror = () => {
            if (eventSources.get(taskId) !== source) {
                return
            }

            if (source.readyState === EventSource.CLOSED) {
                disconnectConnectedTask(taskId, 'Agent stream closed before the task finished')
            } else {
                updateTaskState(taskId, { connectionState: 'reconnecting' })
            }
        }
    }

    async function startTask(input: StartAgentTaskInput, owner: AgentSessionOwner) {
        const lane = getAgentTaskLane(owner)
        const currentSession = getSession(lane)
        const currentState = currentSession === null ? null : getTaskState(currentSession.taskId)

        if (currentState !== null && taskStateActive(currentState)) {
            throw new Error(`Another ${lane} Agent task is already active`)
        }

        const reuseReservedTask =
            currentSession !== null &&
            currentState?.task === null &&
            currentState.sessionUnavailable &&
            ownersMatch(currentSession, owner)
        const taskId = reuseReservedTask ? currentSession.taskId : crypto.randomUUID()

        if (currentSession !== null && currentSession.taskId !== taskId) {
            closeConnection(currentSession.taskId, 'idle')
            removeTaskState(currentSession.taskId)
        }

        saveSession({ ...owner, taskId } as AgentSession)
        setTaskState({
            ...createTaskState(taskId),
            connectionState: 'connecting',
            starting: true,
        })
        let taskRequestStarted = false

        try {
            const health = await requestAgent('/health', parseAgentHealth)
            const unavailableCapability = input.capabilities.find(
                (capability) => !health.capabilities.includes(capability),
            )

            if (unavailableCapability !== undefined) {
                throw new Error(`Agent capability is unavailable: ${unavailableCapability}`)
            }

            taskRequestStarted = true
            const currentTask = await requestAgent(
                `/tasks/${encodeURIComponent(taskId)}`,
                parseAgentTask,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(input),
                },
            )

            assertTaskIdentity(currentTask, taskId)

            if (getSession(lane)?.taskId !== taskId) {
                return currentTask
            }

            updateTaskState(taskId, {
                task: currentTask,
                sessionUnavailable: false,
                error: null,
            })

            if (currentTask.status === 'running') {
                connect(taskId)
            } else {
                finishTask(currentTask)
            }

            return currentTask
        } catch (requestError) {
            if (getSession(lane)?.taskId === taskId) {
                updateTaskState(taskId, {
                    sessionUnavailable:
                        !taskRequestStarted || requestError instanceof AgentRequestError,
                    error:
                        requestError instanceof Error
                            ? requestError.message
                            : 'Could not start Agent task',
                })
                closeConnection(taskId, 'disconnected')
            }

            throw requestError
        } finally {
            updateTaskState(taskId, { starting: false })
        }
    }

    async function restoreTask(taskId: string) {
        const session = sessions.value.find((candidate) => candidate.taskId === taskId)
        const state = getTaskState(taskId)

        if (session === undefined || state === null) {
            return null
        }

        if (state.task?.id === taskId) {
            if (state.task.status === 'running' && !eventSources.has(taskId)) {
                updateTaskState(taskId, {
                    events: [],
                    pendingAction: null,
                    actionSubmitting: false,
                    error: null,
                })
                connect(taskId)
            }

            return state.task
        }

        const existingRestore = restorePromises.get(taskId)

        if (existingRestore !== undefined) {
            return existingRestore
        }

        const restore = async () => {
            closeConnection(taskId, 'connecting')
            setTaskState({
                ...createTaskState(taskId),
                connectionState: 'connecting',
                restoring: true,
            })

            try {
                const currentTask = await requestAgent(
                    `/tasks/${encodeURIComponent(taskId)}`,
                    parseAgentTask,
                )

                assertTaskIdentity(currentTask, taskId)

                if (!sessions.value.some((candidate) => candidate.taskId === taskId)) {
                    return null
                }

                updateTaskState(taskId, {
                    task: currentTask,
                    sessionUnavailable: false,
                    error: null,
                })

                if (currentTask.status === 'running') {
                    connect(taskId)
                } else {
                    finishTask(currentTask)
                }

                return currentTask
            } catch (requestError) {
                if (sessions.value.some((candidate) => candidate.taskId === taskId)) {
                    updateTaskState(taskId, {
                        sessionUnavailable:
                            requestError instanceof AgentRequestError &&
                            requestError.status === 404,
                        error:
                            requestError instanceof Error
                                ? requestError.message
                                : 'Could not restore Agent task',
                    })
                    closeConnection(taskId, 'disconnected')
                }

                throw requestError
            } finally {
                updateTaskState(taskId, { restoring: false })
            }
        }

        const restorePromise = restore().finally(() => {
            restorePromises.delete(taskId)
        })
        restorePromises.set(taskId, restorePromise)
        return restorePromise
    }

    async function restoreSessions() {
        await Promise.allSettled(sessions.value.map(({ taskId }) => restoreTask(taskId)))
    }

    function dismissSession(taskId: string) {
        const state = getTaskState(taskId)

        if (state === null || !taskStateCanDismiss(state)) {
            return false
        }

        closeConnection(taskId, 'idle')
        removeSession(taskId)
        removeTaskState(taskId)
        return true
    }

    async function resolveAction(taskId: string, decision: AgentPermissionDecision) {
        const state = getTaskState(taskId)
        const currentTask = state?.task ?? null
        const currentAction = state?.pendingAction ?? null

        if (currentTask === null || currentAction === null || state?.actionSubmitting) {
            return
        }

        updateTaskState(taskId, { actionSubmitting: true, error: null })

        try {
            await sendAgent(`/tasks/${currentTask.id}/actions/${currentAction.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision }),
            })
        } catch (requestError) {
            const currentState = getTaskState(taskId)

            if (
                currentState?.task?.id === currentTask.id &&
                currentState.pendingAction?.id === currentAction.id
            ) {
                updateTaskState(taskId, {
                    error:
                        requestError instanceof Error
                            ? requestError.message
                            : 'Could not resolve Agent action',
                    actionSubmitting: false,
                })
            }

            throw requestError
        }
    }

    async function allowBrowserActionsForTask(taskId: string) {
        const state = getTaskState(taskId)
        const actionId = state?.pendingAction?.id

        if (state?.task?.status !== 'running' || actionId === undefined || state.actionSubmitting) {
            return
        }

        updateTaskState(taskId, { alwaysAllowBrowserActions: true })

        try {
            await resolveAction(taskId, 'approve')
        } catch (requestError) {
            const currentState = getTaskState(taskId)

            if (currentState?.task?.id === taskId && currentState.pendingAction?.id === actionId) {
                updateTaskState(taskId, { alwaysAllowBrowserActions: false })
            }

            throw requestError
        }
    }

    async function cancelTask(taskId: string) {
        const state = getTaskState(taskId)

        if (state === null || state.cancelling) {
            return state?.task ?? null
        }

        updateTaskState(taskId, { cancelling: true, error: null })

        try {
            const currentTask = await requestAgent(
                `/tasks/${encodeURIComponent(taskId)}/cancel`,
                parseAgentTask,
                {
                    method: 'POST',
                },
            )

            assertTaskIdentity(currentTask, taskId)

            if (currentTask.status !== 'running') {
                finishTask(currentTask)
            } else {
                updateTaskState(taskId, { task: currentTask })
            }

            return currentTask
        } catch (requestError) {
            updateTaskState(taskId, {
                sessionUnavailable:
                    requestError instanceof AgentRequestError && requestError.status === 404,
                error:
                    requestError instanceof Error
                        ? requestError.message
                        : 'Could not cancel Agent task',
            })
            throw requestError
        } finally {
            updateTaskState(taskId, { cancelling: false })
        }
    }

    return {
        sessions,
        taskStates,
        getSession,
        getTaskState,
        startTask,
        restoreTask,
        restoreSessions,
        dismissSession,
        resolveAction,
        allowBrowserActionsForTask,
        cancelTask,
    }
})
