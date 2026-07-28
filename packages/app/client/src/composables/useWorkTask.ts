import type {
    StartWorkTaskInput,
    WorkActionDecision,
    WorkTaskEvent,
} from '@job-search-facilitator/core'
import { computed } from 'vue'
import {
    getWorkTaskLane,
    useWorkStore,
    type WorkSessionOwner,
    type WorkTaskLane,
} from '@/stores/work.store'

const noEvents: WorkTaskEvent[] = []

export function useWorkTask(lane: WorkTaskLane) {
    const workStore = useWorkStore()
    const session = computed(() => workStore.getSession(lane))
    const state = computed(() => {
        const taskId = session.value?.taskId
        return taskId === undefined ? null : workStore.getTaskState(taskId)
    })
    const task = computed(() => state.value?.task ?? null)
    const events = computed(() => state.value?.events ?? noEvents)
    const connectionState = computed(() => state.value?.connectionState ?? 'idle')
    const pendingAction = computed(() => state.value?.pendingAction ?? null)
    const alwaysAllowBrowserActions = computed(
        () => state.value?.alwaysAllowBrowserActions ?? false,
    )
    const actionSubmitting = computed(() => state.value?.actionSubmitting ?? false)
    const cancelling = computed(() => state.value?.cancelling ?? false)
    const starting = computed(() => state.value?.starting ?? false)
    const restoring = computed(() => state.value?.restoring ?? false)
    const sessionUnavailable = computed(() => state.value?.sessionUnavailable ?? false)
    const error = computed(() => state.value?.error ?? null)
    const taskActive = computed(
        () =>
            starting.value ||
            restoring.value ||
            task.value?.status === 'running' ||
            (session.value !== null &&
                task.value === null &&
                error.value === null &&
                !sessionUnavailable.value),
    )
    const canDismissSession = computed(
        () =>
            session.value !== null &&
            !starting.value &&
            !restoring.value &&
            (sessionUnavailable.value ||
                (task.value === null && error.value !== null) ||
                (task.value !== null && task.value.status !== 'running')),
    )
    const actionNeedsAttention = computed(
        () => pendingAction.value !== null && !alwaysAllowBrowserActions.value,
    )

    function currentTaskId() {
        return session.value?.taskId ?? null
    }

    function startTask(input: StartWorkTaskInput, owner: WorkSessionOwner) {
        if (getWorkTaskLane(owner) !== lane) {
            throw new Error(`Work owner does not belong to the ${lane} task lane`)
        }

        return workStore.startTask(input, owner)
    }

    function restoreSession() {
        const taskId = currentTaskId()
        return taskId === null ? Promise.resolve(null) : workStore.restoreTask(taskId)
    }

    function dismissSession() {
        const taskId = currentTaskId()
        return taskId !== null && workStore.dismissSession(taskId)
    }

    function resolveAction(decision: WorkActionDecision) {
        const taskId = currentTaskId()
        return taskId === null ? Promise.resolve() : workStore.resolveAction(taskId, decision)
    }

    function allowBrowserActionsForTask() {
        const taskId = currentTaskId()
        return taskId === null ? Promise.resolve() : workStore.allowBrowserActionsForTask(taskId)
    }

    function cancelTask() {
        const taskId = currentTaskId()
        return taskId === null ? Promise.resolve(null) : workStore.cancelTask(taskId)
    }

    return {
        session,
        task,
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
}
