import type { StartAgentTaskInput, AgentPermissionDecision } from '@job-search-facilitator/core'
import type {
    StartedAgentTask,
    AgentRuntime,
    AgentRuntimeEvent,
    AgentRuntimeHealth,
} from '../src/runtime/agent-runtime.ts'

export class FakeRuntime implements AgentRuntime {
    health: AgentRuntimeHealth = { status: 'healthy', capabilities: ['chrome'] }
    startAttempts = 0
    readonly decisions: Array<{ permissionId: string; decision: AgentPermissionDecision }> = []
    readonly interruptions: Array<{ threadId: string; turnId: string }> = []
    private readonly eventListeners = new Set<(event: AgentRuntimeEvent) => void>()
    private startError: Error | null = null

    constructor(private readonly onInterrupt: () => Promise<void> = async () => {}) {}

    async startTask(_taskId: string, _input: StartAgentTaskInput): Promise<StartedAgentTask> {
        this.startAttempts += 1

        if (this.startError !== null) {
            const error = this.startError
            this.startError = null
            this.fail(error)
            throw error
        }

        const identitySuffix = this.startAttempts === 1 ? '' : `-${this.startAttempts}`

        return {
            threadId: `thread-id${identitySuffix}`,
            turnId: `turn-id${identitySuffix}`,
        }
    }

    async interruptTask(threadId: string, turnId: string): Promise<void> {
        this.interruptions.push({ threadId, turnId })
        await this.onInterrupt()
    }

    resolvePermission(permissionId: string, decision: AgentPermissionDecision): boolean {
        this.decisions.push({ permissionId, decision })
        return true
    }

    onEvent(listener: (event: AgentRuntimeEvent) => void): () => void {
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    emit(event: AgentRuntimeEvent) {
        if (event.type === 'runtime-failed') {
            this.health = {
                status: 'unavailable',
                capabilities: [],
                error: event.error.message,
            }
        }

        for (const listener of this.eventListeners) {
            listener(event)
        }
    }

    fail(error: Error) {
        this.emit({ type: 'runtime-failed', error })
    }

    failNextStart(error: Error) {
        this.startError = error
    }
}
