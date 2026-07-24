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

const workBridgeUrl = (import.meta.env.VITE_WORK_BRIDGE_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
)

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

        throw new Error(message ?? `Work request failed (${response.status})`)
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
    const events = ref<WorkTaskEvent[]>([])
    const connectionState = shallowRef<WorkConnectionState>('idle')
    const pendingAction = shallowRef<WorkActionRequired | null>(null)
    const alwaysAllowBrowserActions = shallowRef(false)
    const actionSubmitting = shallowRef(false)
    const cancelling = shallowRef(false)
    const error = shallowRef<string | null>(null)
    const taskActive = computed(
        () => connectionState.value === 'connecting' || task.value?.status === 'running',
    )
    const actionNeedsAttention = computed(
        () => pendingAction.value !== null && !alwaysAllowBrowserActions.value,
    )
    let eventSource: EventSource | null = null

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
        error.value = null
        closeConnection('closed')
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
                error.value = 'Work stream returned invalid data'
                closeConnection('disconnected')
            }
        }

        source.onerror = () => {
            if (eventSource !== source) {
                return
            }

            if (source.readyState === EventSource.CLOSED) {
                error.value = 'Work stream closed before the task finished'
                closeConnection('disconnected')
            } else {
                connectionState.value = 'reconnecting'
            }
        }
    }

    async function startTask(input: StartWorkTaskInput) {
        closeConnection('connecting')
        task.value = null
        events.value = []
        pendingAction.value = null
        alwaysAllowBrowserActions.value = false
        actionSubmitting.value = false
        cancelling.value = false
        error.value = null

        try {
            const health = await requestWork('/health', parseWorkHealth)

            const unavailableCapability = input.capabilities.find(
                (capability) => !health.capabilities.includes(capability),
            )

            if (unavailableCapability !== undefined) {
                throw new Error(`Work capability is unavailable: ${unavailableCapability}`)
            }

            task.value = await requestWork('/tasks', parseWorkTask, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            })
            connect(task.value.id)

            return task.value
        } catch (requestError) {
            error.value =
                requestError instanceof Error ? requestError.message : 'Could not start Work task'
            closeConnection('disconnected')
            throw requestError
        }
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
        if (task.value?.status !== 'running' || cancelling.value) {
            return task.value
        }

        cancelling.value = true
        error.value = null

        try {
            const currentTask = await requestWork(`/tasks/${task.value.id}/cancel`, parseWorkTask, {
                method: 'POST',
            })

            if (currentTask.status !== 'running') {
                finishTask(currentTask)
            } else {
                task.value = currentTask
            }

            return currentTask
        } catch (requestError) {
            error.value =
                requestError instanceof Error ? requestError.message : 'Could not cancel Work task'
            throw requestError
        } finally {
            cancelling.value = false
        }
    }

    return {
        task,
        events,
        connectionState,
        taskActive,
        pendingAction,
        alwaysAllowBrowserActions,
        actionNeedsAttention,
        actionSubmitting,
        cancelling,
        error,
        startTask,
        resolveAction,
        allowBrowserActionsForTask,
        cancelTask,
    }
})
