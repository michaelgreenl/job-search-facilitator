import type { AgentTask } from '@job-search-facilitator/core'
import type { AgentTaskState } from '@/stores/agent'

type RunningAgentTask = Extract<AgentTask, { status: 'running' }>

export function makeAgentTask(
    overrides: Partial<Omit<RunningAgentTask, 'status' | 'output' | 'error'>> = {},
): RunningAgentTask {
    const id = overrides.id ?? 'f67f9fe5-e502-4d28-8c72-c044f1babbb3'

    return {
        id,
        status: 'running',
        threadId: `thread-${id}`,
        turnId: `turn-${id}`,
        output: null,
        error: null,
        ...overrides,
    }
}

export function makeAgentTaskState(
    task: AgentTask | null,
    overrides: Partial<Omit<AgentTaskState, 'taskId' | 'task'>> & { taskId?: string } = {},
): AgentTaskState {
    const taskId = overrides.taskId ?? task?.id

    if (taskId === undefined) {
        throw new Error('A task or taskId is required to create Agent task state')
    }

    return {
        taskId,
        task,
        events: [],
        connectionState: task?.status === 'running' ? 'connected' : 'closed',
        pendingPermission: null,
        alwaysAllowBrowserActions: false,
        permissionSubmitting: false,
        cancelling: false,
        starting: false,
        restoring: false,
        sessionUnavailable: false,
        error: null,
        ...overrides,
    }
}
