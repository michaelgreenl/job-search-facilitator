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
    readonly interruptions: Array<{ threadId: string; turnId: string }> = []
    private readonly notificationListeners = new Set<
        (notification: AppServerNotification) => void
    >()
    private readonly exitListeners = new Set<(error: Error) => void>()

    constructor(private readonly onInterrupt: () => Promise<void> = async () => {}) {}

    async startTask(_taskId: string, _input: StartWorkTaskInput): Promise<StartedWorkTask> {
        return { threadId: 'thread-id', turnId: 'turn-id' }
    }

    async interruptTask(threadId: string, turnId: string): Promise<void> {
        this.interruptions.push({ threadId, turnId })
        await this.onInterrupt()
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
            params({
                itemId: 'commentary',
                delta: '{"personName":"Checking company staff","personTitle":"Working"}',
            }),
        )
        runtime.notify(
            'item/reasoning/summaryTextDelta',
            params({
                itemId: 'reasoning',
                summaryIndex: 0,
                delta: 'Comparing relevant employees',
            }),
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
        expect(manager.connect(started.id, () => {})?.events[1]?.event).toMatchObject({
            type: 'message',
            textDelta: 'Comparing relevant employees',
        })
    })

    it('marks boundaries between fragmented reasoning summary sections', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        for (const [summaryIndex, delta] of [
            [0, '**Reviewing '],
            [0, 'the role**'],
            [1, '**Finding '],
            [1, 'the team**'],
        ] as const) {
            runtime.notify(
                'item/reasoning/summaryTextDelta',
                params({ itemId: 'reasoning', summaryIndex, delta }),
            )
        }

        const messages = manager
            .connect(started.id, () => {})
            ?.events.flatMap(({ event }) => (event.type === 'message' ? [event] : []))

        expect(messages).toEqual([
            expect.objectContaining({ textDelta: '**Reviewing ', startsNewStatement: true }),
            expect.objectContaining({ textDelta: 'the role**', startsNewStatement: false }),
            expect.objectContaining({ textDelta: '**Finding ', startsNewStatement: true }),
            expect.objectContaining({ textDelta: 'the team**', startsNewStatement: false }),
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

    it('interrupts a running task and records cancellation as a terminal event', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        const result = await manager.cancel(started.id)

        expect(runtime.interruptions).toEqual([
            { threadId: started.threadId, turnId: started.turnId },
        ])
        expect(result).toMatchObject({
            accepted: true,
            task: { status: 'cancelled', output: null, error: null },
        })
        expect(manager.connect(started.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'cancelled',
        })
    })

    it('coalesces concurrent cancellation requests', async () => {
        let finishInterrupt = () => {}
        const runtime = new FakeRuntime(
            () =>
                new Promise<void>((resolve) => {
                    finishInterrupt = resolve
                }),
        )
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        const firstCancellation = manager.cancel(started.id)
        const secondCancellation = manager.cancel(started.id)
        finishInterrupt()

        const results = await Promise.all([firstCancellation, secondCancellation])

        expect(runtime.interruptions).toHaveLength(1)
        expect(results).toEqual([
            expect.objectContaining({ accepted: true }),
            expect.objectContaining({ accepted: true }),
        ])
        expect(
            manager
                .connect(started.id, () => {})
                ?.events.filter(({ event }) => event.type === 'cancelled'),
        ).toHaveLength(1)
    })

    it('keeps a completed result when completion wins the cancellation race', async () => {
        let rejectInterrupt = (_error: Error) => {}
        const runtime = new FakeRuntime(
            () =>
                new Promise<void>((_resolve, reject) => {
                    rejectInterrupt = reject
                }),
        )
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        const cancellation = manager.cancel(started.id)
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
        runtime.notify('turn/completed', params({ turn: { status: 'completed' } }))
        rejectInterrupt(new Error('Turn is no longer active'))

        const result = await cancellation

        expect(result).toMatchObject({
            accepted: true,
            task: { status: 'completed', output: { contacts: [] } },
        })
        expect(
            manager
                .connect(started.id, () => {})
                ?.events.filter(({ event }) => event.type === 'cancelled'),
        ).toHaveLength(0)
    })

    it('keeps a task running when interruption fails before a terminal event', async () => {
        const runtime = new FakeRuntime(async () => {
            throw new Error('Could not interrupt turn')
        })
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        await expect(manager.cancel(started.id)).rejects.toThrow('Could not interrupt turn')

        expect(manager.get(started.id)).toMatchObject({
            status: 'running',
            output: null,
            error: null,
        })
        expect(
            manager
                .connect(started.id, () => {})
                ?.events.filter(({ event }) => event.type === 'cancelled'),
        ).toHaveLength(0)
    })

    it('records an interrupted turn as cancelled instead of failed', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        runtime.notify('turn/completed', params({ turn: { status: 'interrupted' } }))

        expect(manager.get(started.id)).toMatchObject({
            status: 'cancelled',
            output: null,
            error: null,
        })
        expect(manager.connect(started.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'cancelled',
        })
    })
})
