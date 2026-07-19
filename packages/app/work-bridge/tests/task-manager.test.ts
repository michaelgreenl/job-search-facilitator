import type {
    StartWorkTaskInput,
    WorkActionDecision,
    WorkCapability,
} from '@job-search-facilitator/core'
import { describe, expect, it } from 'vitest'
import type {
    AppServerNotification,
    StartedWorkTask,
    WorkRuntime,
    WorkRuntimeAction,
} from '../src/app-server.ts'
import { WorkTaskManager } from '../src/task-manager.ts'

class FakeRuntime implements WorkRuntime {
    readonly capabilities: WorkCapability[] = ['chrome']
    private readonly notificationListeners = new Set<
        (notification: AppServerNotification) => void
    >()
    private readonly exitListeners = new Set<(error: Error) => void>()

    async startTask(_taskId: string, _input: StartWorkTaskInput): Promise<StartedWorkTask> {
        return { threadId: 'thread-id', turnId: 'turn-id' }
    }

    resolveAction(_actionId: string, _decision: WorkActionDecision): boolean {
        return false
    }

    onActionRequired(_listener: (action: WorkRuntimeAction) => void): () => void {
        return () => {}
    }

    onNotification(listener: (notification: AppServerNotification) => void): () => void {
        this.notificationListeners.add(listener)
        return () => this.notificationListeners.delete(listener)
    }

    onExit(listener: (error: Error) => void): () => void {
        this.exitListeners.add(listener)
        return () => this.exitListeners.delete(listener)
    }

    notify(method: string, params: Record<string, unknown>) {
        for (const listener of this.notificationListeners) {
            listener({ method, params })
        }
    }
}

const input: StartWorkTaskInput = {
    prompt: 'Find contacts',
    outputSchema: { type: 'object' },
    capabilities: ['chrome'],
}

const params = (values: Record<string, unknown> = {}) => ({
    threadId: 'thread-id',
    turnId: 'turn-id',
    ...values,
})

describe('Work task manager', () => {
    it('streams safe progress and stores the final structured output', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)
        const connection = manager.connect(started.id, () => {})

        runtime.notify(
            'item/started',
            params({ item: { type: 'agentMessage', id: 'commentary', phase: 'commentary' } }),
        )
        runtime.notify(
            'item/agentMessage/delta',
            params({ itemId: 'commentary', delta: 'Checking company staff' }),
        )
        runtime.notify(
            'item/started',
            params({ item: { type: 'agentMessage', id: 'final', phase: 'final_answer' } }),
        )
        runtime.notify(
            'item/agentMessage/delta',
            params({ itemId: 'final', delta: '{"contacts":' }),
        )
        runtime.notify(
            'item/completed',
            params({
                item: {
                    type: 'agentMessage',
                    id: 'final',
                    phase: 'final_answer',
                    text: '{"contacts":[]}',
                },
            }),
        )
        runtime.notify('turn/completed', params({ turn: { id: 'turn-id', status: 'completed' } }))

        expect(manager.get(started.id)).toMatchObject({
            status: 'completed',
            output: { contacts: [] },
        })
        expect(connection?.events).toEqual([
            {
                id: 1,
                event: expect.objectContaining({ type: 'activity', message: 'Task started' }),
            },
        ])
        expect(
            manager.connect(started.id, () => {})?.events.map(({ id, event }) => [id, event.type]),
        ).toEqual([
            [1, 'activity'],
            [2, 'message'],
            [3, 'completed'],
        ])
    })

    it('fails a completed turn that does not contain structured output', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        runtime.notify(
            'item/completed',
            params({
                item: {
                    type: 'agentMessage',
                    id: 'final',
                    phase: 'final_answer',
                    text: 'not json',
                },
            }),
        )
        runtime.notify('turn/completed', params({ turn: { id: 'turn-id', status: 'completed' } }))

        expect(manager.get(started.id)).toMatchObject({
            status: 'failed',
            error: 'Work task returned invalid structured output',
        })
    })
})
