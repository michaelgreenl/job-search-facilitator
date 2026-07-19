import type {
    JsonObject,
    StartWorkTaskInput,
    WorkActionDecision,
    WorkActionRequired,
    WorkCapability,
    WorkTask,
    WorkTaskEvent,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

type WorkConnectionState =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'closed'

interface WorkHealthResponse {
    status: 'healthy'
    capabilities: WorkCapability[]
}

const workBridgeUrl = (import.meta.env.VITE_WORK_BRIDGE_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
)

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const isWorkAction = (value: unknown): value is WorkActionRequired =>
    isObject(value) &&
    typeof value.id === 'string' &&
    value.kind === 'browser-origin' &&
    typeof value.message === 'string' &&
    typeof value.origin === 'string'

const isWorkTaskEvent = (value: unknown): value is WorkTaskEvent => {
    if (!isObject(value) || typeof value.createdAt !== 'string') {
        return false
    }

    if (value.type === 'activity') {
        return typeof value.message === 'string'
    }

    if (value.type === 'message') {
        return typeof value.textDelta === 'string'
    }

    if (value.type === 'action-required') {
        return isWorkAction(value.action)
    }

    if (value.type === 'action-resolved') {
        return typeof value.actionId === 'string'
    }

    if (value.type === 'completed') {
        return isObject(value.output)
    }

    return (
        value.type === 'cancelled' || (value.type === 'failed' && typeof value.error === 'string')
    )
}

const requestWork = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${workBridgeUrl}${path}`, init)

    if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const message = isObject(body) && typeof body.error === 'string' ? body.error : null

        throw new Error(message ?? `Work request failed (${response.status})`)
    }

    return response.json() as Promise<T>
}

export const useWorkStore = defineStore('work', () => {
    const task = shallowRef<WorkTask | null>(null)
    const events = ref<WorkTaskEvent[]>([])
    const connectionState = shallowRef<WorkConnectionState>('idle')
    const pendingAction = shallowRef<WorkActionRequired | null>(null)
    const actionSubmitting = shallowRef(false)
    const cancelling = shallowRef(false)
    const error = shallowRef<string | null>(null)
    const taskActive = computed(
        () => connectionState.value === 'connecting' || task.value?.status === 'running',
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

                if (!isWorkTaskEvent(value)) {
                    throw new Error()
                }

                events.value.push(value)

                if (value.type === 'action-required') {
                    pendingAction.value = value.action
                    actionSubmitting.value = false
                    error.value = null
                } else if (
                    value.type === 'action-resolved' &&
                    pendingAction.value?.id === value.actionId
                ) {
                    pendingAction.value = null
                    actionSubmitting.value = false
                    error.value = null
                } else if (value.type === 'completed' && task.value !== null) {
                    finishTask({ ...task.value, status: 'completed', output: value.output })
                } else if (value.type === 'failed' && task.value !== null) {
                    finishTask({ ...task.value, status: 'failed', error: value.error })
                } else if (value.type === 'cancelled' && task.value !== null) {
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
        actionSubmitting.value = false
        cancelling.value = false
        error.value = null

        try {
            const health = await requestWork<WorkHealthResponse>('/health')

            const unavailableCapability = input.capabilities.find(
                (capability) => !health.capabilities.includes(capability),
            )

            if (unavailableCapability !== undefined) {
                throw new Error(`Work capability is unavailable: ${unavailableCapability}`)
            }

            task.value = await requestWork<WorkTask>('/tasks', {
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
        if (task.value === null || pendingAction.value === null || actionSubmitting.value) {
            return
        }

        actionSubmitting.value = true
        error.value = null

        try {
            await requestWork(`/tasks/${task.value.id}/actions/${pendingAction.value.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision }),
            })
        } catch (requestError) {
            error.value =
                requestError instanceof Error
                    ? requestError.message
                    : 'Could not resolve Work action'
            actionSubmitting.value = false
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
            const currentTask = await requestWork<WorkTask>(`/tasks/${task.value.id}/cancel`, {
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
        actionSubmitting,
        cancelling,
        error,
        startTask,
        resolveAction,
        cancelTask,
    }
})
