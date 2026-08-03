import { parseJobUpdateCheckResult } from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { createJobUpdateCheckTask } from '@/services/agent/job-update-check-task'
import { fetchJobUpdateCheckContext, saveJobUpdates } from '@/services/job-update-check'
import { useAgentStore } from './agent'

export const useJobUpdateCheckStore = defineStore('job-update-check', () => {
    const agentStore = useAgentStore()
    const savingTaskId = shallowRef<string | null>(null)
    const error = shallowRef<string | null>(null)
    const notice = shallowRef<string | null>(null)
    const savedRevision = shallowRef(0)
    const starting = shallowRef(false)
    const session = computed(
        () => agentStore.sessions.find(({ kind }) => kind === 'job-update-check') ?? null,
    )
    const taskId = computed(() => session.value?.taskId ?? null)
    const taskState = computed(() =>
        taskId.value === null ? null : agentStore.getTaskState(taskId.value),
    )
    const running = computed(
        () => starting.value || (taskId.value !== null && agentStore.isTaskActive(taskId.value)),
    )
    const saving = computed(() => savingTaskId.value !== null)
    const issue = computed(
        () =>
            error.value ??
            taskState.value?.error ??
            (taskState.value?.task?.status === 'failed' ? taskState.value.task.error : null),
    )
    const canRetry = computed(
        () =>
            taskId.value !== null &&
            !running.value &&
            !saving.value &&
            (taskState.value?.task?.status === 'failed' ||
                taskState.value?.task?.status === 'cancelled' ||
                (taskState.value?.error ?? null) !== null ||
                error.value !== null),
    )

    watch(
        () => [taskId.value, taskState.value?.task?.status] as const,
        ([currentTaskId, status]) => {
            if (currentTaskId !== null && status === 'completed') {
                void saveCompleted(currentTaskId)
            }
        },
        { immediate: true },
    )

    async function saveCompleted(currentTaskId: string) {
        const state = agentStore.getTaskState(currentTaskId)

        if (
            state?.task?.status !== 'completed' ||
            session.value?.taskId !== currentTaskId ||
            savingTaskId.value === currentTaskId
        ) {
            return
        }

        savingTaskId.value = currentTaskId
        error.value = null

        try {
            const result = parseJobUpdateCheckResult(state.task.output)
            const saved = await saveJobUpdates(result)
            notice.value =
                saved.createdActivities === 0
                    ? 'No new updates found.'
                    : `${saved.createdActivities} new update${saved.createdActivities === 1 ? '' : 's'} found.`

            if (result.warnings.length > 0) {
                notice.value += ` ${result.warnings.join(' ')}`
            }

            agentStore.dismissSession(currentTaskId)
            savedRevision.value += 1
        } catch (requestError) {
            error.value =
                requestError instanceof Error ? requestError.message : 'Could not save job updates'
        } finally {
            savingTaskId.value = null
        }
    }

    async function start() {
        if (taskId.value !== null) {
            return true
        }

        if (starting.value) {
            return false
        }

        starting.value = true
        error.value = null
        notice.value = null

        try {
            const context = await fetchJobUpdateCheckContext()

            if (context.posts.length === 0) {
                notice.value = 'No active applications or pending outreach need checking.'
                return false
            }

            const started = agentStore.startTask(createJobUpdateCheckTask(context), {
                kind: 'job-update-check',
            })
            await started.started
            return true
        } catch (requestError) {
            error.value =
                requestError instanceof Error
                    ? requestError.message
                    : 'Could not start update check'
            throw requestError
        } finally {
            starting.value = false
        }
    }

    async function retry() {
        if (starting.value) {
            return false
        }

        const currentTaskId = taskId.value

        if (currentTaskId === null) {
            return start()
        }

        if (taskState.value?.task?.status === 'completed') {
            await saveCompleted(currentTaskId)
            return true
        }

        starting.value = true
        error.value = null

        try {
            const context = await fetchJobUpdateCheckContext()
            await agentStore.retryTask(currentTaskId, createJobUpdateCheckTask(context)).started
            return true
        } catch (requestError) {
            error.value =
                requestError instanceof Error
                    ? requestError.message
                    : 'Could not retry update check'
            throw requestError
        } finally {
            starting.value = false
        }
    }

    const restore = async () => {
        if (taskId.value !== null) {
            await agentStore.restoreTask(taskId.value)
        }
    }

    const cancel = async () => {
        if (taskId.value !== null) {
            await agentStore.cancelTask(taskId.value)
        }
    }

    return {
        canRetry,
        issue,
        notice,
        running,
        savedRevision,
        saving,
        taskId,
        taskState,
        cancel,
        restore,
        retry,
        start,
    }
})
