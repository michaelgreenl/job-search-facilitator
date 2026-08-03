import { parseApplicationCaptureResult, type JobPost } from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { saveApplicationCapture } from '@/services/application-capture'
import { createApplicationCaptureTask } from '@/services/agent/application-capture-task'
import { useAgentStore } from './agent'
import { usePostStore } from './post'

export const useApplicationCaptureStore = defineStore('application-capture', () => {
    const agentStore = useAgentStore()
    const postStore = usePostStore()
    const savingTaskId = shallowRef<string | null>(null)
    const error = shallowRef<string | null>(null)
    const lastSavedPostId = shallowRef<string | null>(null)
    const session = computed(
        () => agentStore.sessions.find(({ kind }) => kind === 'application-capture') ?? null,
    )
    const taskId = computed(() => session.value?.taskId ?? null)
    const postId = computed(() =>
        session.value?.kind === 'application-capture' ? session.value.postId : null,
    )
    const taskState = computed(() =>
        taskId.value === null ? null : agentStore.getTaskState(taskId.value),
    )
    const running = computed(() => taskId.value !== null && agentStore.isTaskActive(taskId.value))
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
                void saveCompletedCapture(currentTaskId)
            }
        },
        { immediate: true },
    )

    async function saveCompletedCapture(currentTaskId: string) {
        const currentSession = session.value
        const state = agentStore.getTaskState(currentTaskId)

        if (
            currentSession?.kind !== 'application-capture' ||
            currentSession.taskId !== currentTaskId ||
            state?.task?.status !== 'completed' ||
            savingTaskId.value === currentTaskId
        ) {
            return
        }

        savingTaskId.value = currentTaskId
        error.value = null

        try {
            const capture = parseApplicationCaptureResult(state.task.output)
            await saveApplicationCapture(currentSession.postId, capture)
            lastSavedPostId.value = currentSession.postId
            agentStore.dismissSession(currentTaskId)
        } catch (requestError) {
            error.value =
                requestError instanceof Error
                    ? requestError.message
                    : 'Could not save application capture'
        } finally {
            savingTaskId.value = null
        }
    }

    async function start(post: JobPost) {
        const currentSession = session.value

        if (currentSession?.kind === 'application-capture') {
            if (
                currentSession.postId === post.id ||
                agentStore.isTaskActive(currentSession.taskId) ||
                taskState.value?.task?.status === 'completed'
            ) {
                return currentSession.postId
            }

            agentStore.dismissSession(currentSession.taskId)
        }

        error.value = null
        lastSavedPostId.value = null
        const started = agentStore.startTask(createApplicationCaptureTask(post), {
            kind: 'application-capture',
            postId: post.id,
        })
        await started.started
        return post.id
    }

    async function retry() {
        const currentTaskId = taskId.value
        const currentPostId = postId.value

        if (currentTaskId === null || currentPostId === null) {
            return
        }

        if (taskState.value?.task?.status === 'completed') {
            await saveCompletedCapture(currentTaskId)
            return
        }

        error.value = null
        const post = postStore.findPost(currentPostId) ?? (await postStore.fetchPost(currentPostId))
        await agentStore.retryTask(currentTaskId, createApplicationCaptureTask(post)).started
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

    const messageFor = (currentPostId: string) =>
        lastSavedPostId.value === currentPostId ? 'Application and job post captured.' : null

    return {
        canRetry,
        issue,
        lastSavedPostId,
        messageFor,
        postId,
        running,
        saving,
        taskId,
        taskState,
        cancel,
        restore,
        retry,
        start,
    }
})
