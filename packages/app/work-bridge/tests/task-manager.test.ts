import type { StartWorkTaskInput, WorkActionDecision } from '@job-search-facilitator/core'
import { describe, expect, it } from 'vitest'
import type {
    StartedWorkTask,
    WorkRuntime,
    WorkRuntimeEvent,
    WorkRuntimeHealth,
} from '../src/app-server.ts'
import { WorkTaskManager } from '../src/task-manager.ts'

class FakeRuntime implements WorkRuntime {
    readonly interruptions: Array<{ threadId: string; turnId: string }> = []
    health: WorkRuntimeHealth = { status: 'healthy', capabilities: ['chrome'] }
    private readonly eventListeners = new Set<(event: WorkRuntimeEvent) => void>()

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
}

const input: StartWorkTaskInput = {
    prompt: 'Find contacts',
    outputSchema: { type: 'object' },
    capabilities: ['chrome'],
}

const eventIdentity = {
    threadId: 'thread-id',
    turnId: 'turn-id',
} as const

describe('Work task manager', () => {
    it('streams reasoning progress and stores the final structured output', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        runtime.emit({
            type: 'reasoning-delta',
            ...eventIdentity,
            itemId: 'reasoning',
            summaryIndex: 0,
            textDelta: 'Comparing relevant employees',
        })
        runtime.emit({
            type: 'final-message',
            ...eventIdentity,
            text: '{"contacts":[]}',
        })
        runtime.emit({
            type: 'turn-completed',
            ...eventIdentity,
            status: 'completed',
            error: null,
        })

        expect(manager.get(started.id)).toMatchObject({
            status: 'completed',
            output: { contacts: [] },
        })
        const events = manager.connect(started.id, () => {})?.events

        expect(events?.map(({ id, event }) => [id, event.type])).toEqual([
            [1, 'activity'],
            [2, 'message'],
            [3, 'completed'],
        ])
        expect(events?.[1]?.event).toMatchObject({
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
            runtime.emit({
                type: 'reasoning-delta',
                ...eventIdentity,
                itemId: 'reasoning',
                summaryIndex,
                textDelta: delta,
            })
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

        runtime.emit({ type: 'final-message', ...eventIdentity, text: 'not json' })
        runtime.emit({
            type: 'turn-completed',
            ...eventIdentity,
            status: 'completed',
            error: null,
        })

        expect(manager.get(started.id)).toMatchObject({
            status: 'failed',
            error: 'Work task returned invalid structured output',
        })
    })

    it('preserves the runtime error when a turn fails', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        runtime.emit({
            type: 'turn-completed',
            ...eventIdentity,
            status: 'failed',
            error: 'Model unavailable',
        })

        expect(manager.get(started.id)).toMatchObject({
            status: 'failed',
            error: 'Model unavailable',
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
        runtime.emit({
            type: 'final-message',
            ...eventIdentity,
            text: '{"contacts":[]}',
        })
        runtime.emit({
            type: 'turn-completed',
            ...eventIdentity,
            status: 'completed',
            error: null,
        })
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

        runtime.emit({
            type: 'turn-completed',
            ...eventIdentity,
            status: 'interrupted',
            error: null,
        })

        expect(manager.get(started.id)).toMatchObject({
            status: 'cancelled',
            output: null,
            error: null,
        })
        expect(manager.connect(started.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'cancelled',
        })
    })

    it('fails running tasks once when the runtime fails and preserves completed tasks', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const completed = await manager.start(input)

        runtime.emit({
            type: 'final-message',
            ...eventIdentity,
            text: '{"contacts":[]}',
        })
        runtime.emit({
            type: 'turn-completed',
            ...eventIdentity,
            status: 'completed',
            error: null,
        })

        const running = await manager.start(input)
        const failure = { type: 'runtime-failed', error: new Error('Work runtime exited') } as const

        runtime.emit(failure)
        runtime.emit(failure)

        expect(manager.get(completed.id)).toMatchObject({
            status: 'completed',
            output: { contacts: [] },
            error: null,
        })
        expect(manager.get(running.id)).toMatchObject({
            status: 'failed',
            output: null,
            error: 'Work runtime exited',
        })
        expect(
            manager
                .connect(running.id, () => {})
                ?.events.filter(({ event }) => event.type === 'failed'),
        ).toHaveLength(1)
    })
})
