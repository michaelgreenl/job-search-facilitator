import {
    type StartAgentTaskInput,
    type AgentPermissionDecision,
    type AgentPermissionRequired,
    type AgentTask,
    type AgentTaskEvent,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import {
    agentSessionOwnersMatch,
    getAgentTaskLane,
    readAgentSessions,
    writeAgentSessions,
    type AgentSession,
    type AgentSessionOwner,
    type AgentTaskLane,
} from '@/services/agent/agent-session'
import {
    AgentBridgeRequestError,
    cancelAgentTask,
    connectAgentTask,
    fetchAgentHealth,
    fetchAgentTask,
    resolveAgentPermission,
    startAgentTask,
    type AgentTaskConnection,
} from '@/services/agent/agent-bridge'

export {
    getAgentTaskLane,
    type AgentSession,
    type AgentSessionOwner,
    type AgentTaskLane,
} from '@/services/agent/agent-session'

export type AgentConnectionState =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'closed'

export interface AgentTaskState {
    taskId: string
    task: AgentTask | null
    events: AgentTaskEvent[]
    connectionState: AgentConnectionState
    pendingPermission: AgentPermissionRequired | null
    alwaysAllowBrowserActions: boolean
    permissionSubmitting: boolean
    cancelling: boolean
    starting: boolean
    restoring: boolean
    sessionUnavailable: boolean
    error: string | null
}

const createTaskState = (taskId: string): AgentTaskState => ({
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
})

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
    const eventSources = new Map<string, AgentTaskConnection>()
    const restorePromises = new Map<string, Promise<AgentTask | null>>()
    const nonRestorableTaskIds = new Set<string>()

    function persistSessions() {
        writeAgentSessions(sessions.value.filter(({ taskId }) => !nonRestorableTaskIds.has(taskId)))
    }

    function getSession(lane: AgentTaskLane) {
        return sessions.value.find((session) => getAgentTaskLane(session) === lane) ?? null
    }

    function getTaskState(taskId: string) {
        return taskStates.value[taskId] ?? null
    }

    function getLaneTaskState(lane: AgentTaskLane) {
        const session = getSession(lane)
        return session === null ? null : getTaskState(session.taskId)
    }

    function isLaneTaskActive(lane: AgentTaskLane) {
        const state = getLaneTaskState(lane)
        return state !== null && taskStateActive(state)
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
        nonRestorableTaskIds.delete(nextSession.taskId)
        sessions.value = [
            ...sessions.value.filter((session) => getAgentTaskLane(session) !== lane),
            nextSession,
        ]
        persistSessions()
    }

    function removeSession(taskId: string) {
        sessions.value = sessions.value.filter((session) => session.taskId !== taskId)
        nonRestorableTaskIds.delete(taskId)
        persistSessions()
    }

    function closeConnection(taskId: string, connectionState: AgentConnectionState) {
        eventSources.get(taskId)?.close()
        eventSources.delete(taskId)
        updateTaskState(taskId, { connectionState })
    }

    function finishTask(currentTask: AgentTask) {
        updateTaskState(currentTask.id, {
            task: currentTask,
            pendingPermission: null,
            alwaysAllowBrowserActions: false,
            permissionSubmitting: false,
            cancelling: false,
            sessionUnavailable: false,
            error: null,
        })
        closeConnection(currentTask.id, 'closed')

        if (currentTask.status === 'cancelled') {
            nonRestorableTaskIds.add(currentTask.id)
            persistSessions()
        }
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
        const connection = connectAgentTask(taskId, {
            onOpen: () => {
                if (eventSources.get(taskId) === connection) {
                    updateTaskState(taskId, { connectionState: 'connected' })
                }
            },
            onEvent: (event) => {
                if (eventSources.get(taskId) !== connection) {
                    return
                }

                const state = updateTaskState(taskId, (currentState) => ({
                    ...currentState,
                    events: [...currentState.events, event],
                }))

                if (state === null) {
                    return
                }

                if (event.type === 'permission-required') {
                    updateTaskState(taskId, {
                        pendingPermission: event.permission,
                        permissionSubmitting: false,
                        error: null,
                    })

                    if (state.alwaysAllowBrowserActions) {
                        void allowBrowserActionsForTask(taskId).catch(() => undefined)
                    }
                } else if (
                    event.type === 'permission-resolved' &&
                    state.pendingPermission?.id === event.permissionId
                ) {
                    updateTaskState(taskId, {
                        pendingPermission: null,
                        permissionSubmitting: false,
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
            },
            onInvalidEvent: () => {
                if (eventSources.get(taskId) === connection) {
                    disconnectConnectedTask(taskId, 'Agent stream returned invalid data')
                }
            },
            onDisconnected: () => {
                if (eventSources.get(taskId) !== connection) {
                    return
                }

                disconnectConnectedTask(taskId, 'Agent stream closed before the task finished')
            },
            onReconnecting: () => {
                if (eventSources.get(taskId) === connection) {
                    updateTaskState(taskId, { connectionState: 'reconnecting' })
                }
            },
        })
        eventSources.set(taskId, connection)
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
            agentSessionOwnersMatch(currentSession, owner)
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
            const health = await fetchAgentHealth()
            const unavailableCapability = input.capabilities.find(
                (capability) => !health.capabilities.includes(capability),
            )

            if (unavailableCapability !== undefined) {
                throw new Error(`Agent capability is unavailable: ${unavailableCapability}`)
            }

            taskRequestStarted = true
            const currentTask = await startAgentTask(taskId, input)

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
                        !taskRequestStarted || requestError instanceof AgentBridgeRequestError,
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
                    pendingPermission: null,
                    permissionSubmitting: false,
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
                const currentTask = await fetchAgentTask(taskId)

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
                            requestError instanceof AgentBridgeRequestError &&
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

    async function resolvePermission(taskId: string, decision: AgentPermissionDecision) {
        const state = getTaskState(taskId)
        const currentTask = state?.task ?? null
        const currentPermission = state?.pendingPermission ?? null

        if (currentTask === null || currentPermission === null || state?.permissionSubmitting) {
            return
        }

        updateTaskState(taskId, { permissionSubmitting: true, error: null })

        try {
            await resolveAgentPermission(currentTask.id, currentPermission.id, decision)
        } catch (requestError) {
            const currentState = getTaskState(taskId)

            if (
                currentState?.task?.id === currentTask.id &&
                currentState.pendingPermission?.id === currentPermission.id
            ) {
                updateTaskState(taskId, {
                    error:
                        requestError instanceof Error
                            ? requestError.message
                            : 'Could not resolve Agent permission',
                    permissionSubmitting: false,
                })
            }

            throw requestError
        }
    }

    async function allowBrowserActionsForTask(taskId: string) {
        const state = getTaskState(taskId)
        const permissionId = state?.pendingPermission?.id

        if (
            state?.task?.status !== 'running' ||
            permissionId === undefined ||
            state.permissionSubmitting
        ) {
            return
        }

        updateTaskState(taskId, { alwaysAllowBrowserActions: true })

        try {
            await resolvePermission(taskId, 'approve')
        } catch (requestError) {
            const currentState = getTaskState(taskId)

            if (
                currentState?.task?.id === taskId &&
                currentState.pendingPermission?.id === permissionId
            ) {
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
            const currentTask = await cancelAgentTask(taskId)

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
                    requestError instanceof AgentBridgeRequestError && requestError.status === 404,
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
        getLaneTaskState,
        isLaneTaskActive,
        startTask,
        restoreTask,
        restoreSessions,
        dismissSession,
        resolvePermission,
        allowBrowserActionsForTask,
        cancelTask,
    }
})
