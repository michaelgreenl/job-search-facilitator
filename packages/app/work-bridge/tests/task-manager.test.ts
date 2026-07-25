import {
    createContactDiscoveryOutputSchema,
    createDraftRevisionOutputSchema,
    type StartWorkTaskInput,
} from '@job-search-facilitator/core'
import { describe, expect, it } from 'vitest'
import {
    InvalidWorkOutputSchemaError,
    WorkTaskManager,
    type WorkTaskStreamEvent,
} from '../src/task-manager.ts'
import { FakeRuntime } from './fake-runtime.ts'

const input: StartWorkTaskInput = {
    prompt: 'Find contacts',
    outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            contacts: { type: 'array' },
        },
        required: ['contacts'],
    },
    capabilities: ['chrome'],
}

const eventIdentity = {
    threadId: 'thread-id',
    turnId: 'turn-id',
} as const

describe('Work task manager', () => {
    it('delivers live events only while a listener is subscribed', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)
        const streamedEvents: WorkTaskStreamEvent[] = []
        const connection = manager.connect(started.id, (event) => streamedEvents.push(event))

        runtime.emit({
            type: 'reasoning-delta',
            ...eventIdentity,
            itemId: 'reasoning',
            summaryIndex: 0,
            textDelta: 'First update',
        })
        connection?.unsubscribe()
        runtime.emit({
            type: 'reasoning-delta',
            ...eventIdentity,
            itemId: 'reasoning',
            summaryIndex: 0,
            textDelta: 'Second update',
        })

        expect(streamedEvents.map(({ id, event }) => [id, event.type])).toEqual([[2, 'message']])
    })

    it('stores final structured output and replays its ordered event sequence', async () => {
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

    it.each([
        [
            'contact discovery',
            createContactDiscoveryOutputSchema,
            {
                personName: 'Ada Lovelace',
                personTitle: 'Engineering Manager',
                profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
                relevanceRationale: 'Her visible role aligns with the team.',
                draftMessage: 'Hi Ada, could I ask about the team?',
            },
        ],
        [
            'draft revision',
            createDraftRevisionOutputSchema,
            {
                draftMessage: 'Hi Ada, could I ask about the engineering team?',
                response: 'I made the message more specific.',
            },
        ],
    ] as const)(
        'accepts output satisfying the generated %s contract',
        async (_name, createOutputSchema, output) => {
            const runtime = new FakeRuntime()
            const manager = new WorkTaskManager(runtime)
            const started = await manager.start({
                ...input,
                outputSchema: createOutputSchema(),
            })

            runtime.emit({
                type: 'final-message',
                ...eventIdentity,
                text: JSON.stringify(output),
            })
            runtime.emit({
                type: 'turn-completed',
                ...eventIdentity,
                status: 'completed',
                error: null,
            })

            expect(manager.get(started.id)).toEqual({
                ...started,
                status: 'completed',
                output,
            })
        },
    )

    it.each([
        ['malformed', { type: 'not-a-json-schema-type' }],
        ['asynchronous', { $async: true, type: 'object' }],
        ['non-object', { type: 'array' }],
        ['dialect marker', { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object' }],
        [
            'nested dialect marker',
            {
                type: 'object',
                properties: {
                    value: {
                        $schema: 'http://json-schema.org/draft-07/schema#',
                        type: 'string',
                    },
                },
            },
        ],
        [
            'unsupported format',
            {
                type: 'object',
                properties: { email: { type: 'string', format: 'email' } },
            },
        ],
    ])('rejects a %s output schema before starting the runtime', async (_kind, outputSchema) => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)

        await expect(
            manager.start({
                ...input,
                outputSchema: outputSchema as StartWorkTaskInput['outputSchema'],
            }),
        ).rejects.toBeInstanceOf(InvalidWorkOutputSchemaError)
        expect(runtime.startAttempts).toBe(0)
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

    it('fails a completed turn whose final output is not JSON', async () => {
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
            output: null,
            error: expect.any(String),
        })
    })

    it('fails a completed turn whose output does not match the requested schema', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        runtime.emit({ type: 'final-message', ...eventIdentity, text: '{"wrong":true}' })
        runtime.emit({
            type: 'turn-completed',
            ...eventIdentity,
            status: 'completed',
            error: null,
        })

        expect(manager.get(started.id)).toMatchObject({
            status: 'failed',
            output: null,
            error: expect.any(String),
        })
        expect(
            manager
                .connect(started.id, () => {})
                ?.events.some(({ event }) => event.type === 'completed'),
        ).toBe(false)
    })

    it('preserves the runtime error when a turn fails', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const started = await manager.start(input)

        runtime.emit({
            type: 'turn-completed',
            ...eventIdentity,
            status: 'failed',
            error: 'runtime failure',
        })

        expect(manager.get(started.id)).toMatchObject({
            status: 'failed',
            error: 'runtime failure',
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
