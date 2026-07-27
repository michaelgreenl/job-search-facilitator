import type { StartWorkTaskInput, WorkActionDecision } from '@job-search-facilitator/core'
import type {
    StartedWorkTask,
    WorkRuntime,
    WorkRuntimeEvent,
    WorkRuntimeHealth,
} from '../src/app-server.ts'

export class FakeRuntime implements WorkRuntime {
    health: WorkRuntimeHealth = { status: 'healthy', capabilities: ['chrome'] }
    startAttempts = 0
    readonly decisions: Array<{ actionId: string; decision: WorkActionDecision }> = []
    readonly interruptions: Array<{ threadId: string; turnId: string }> = []
    private readonly eventListeners = new Set<(event: WorkRuntimeEvent) => void>()
    private startError: Error | null = null

    constructor(private readonly onInterrupt: () => Promise<void> = async () => {}) {}

    async startTask(_taskId: string, _input: StartWorkTaskInput): Promise<StartedWorkTask> {
        this.startAttempts += 1

        if (this.startError !== null) {
            const error = this.startError
            this.startError = null
            this.fail(error)
            throw error
        }

        return { threadId: 'thread-id', turnId: 'turn-id' }
    }

    async interruptTask(threadId: string, turnId: string): Promise<void> {
        this.interruptions.push({ threadId, turnId })
        await this.onInterrupt()
    }

    resolveAction(actionId: string, decision: WorkActionDecision): boolean {
        this.decisions.push({ actionId, decision })
        return true
    }

    onEvent(listener: (event: WorkRuntimeEvent) => void): () => void {
        this.eventListeners.add(listener)
        return () => this.eventListeners.delete(listener)
    }

    emit(event: WorkRuntimeEvent) {
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
