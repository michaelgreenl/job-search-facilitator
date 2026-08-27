import {
    createContactDiscoveryOutputSchema,
    createDraftRevisionOutputSchema,
    createUserAddedJobPostOutputSchema,
    type StartAgentTaskInput,
} from '@job-search-facilitator/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentTaskManager, type AgentTaskStreamEvent } from '../src/tasks/agent-task-manager.ts'
import { InvalidAgentOutputSchemaError } from '../src/tasks/output-schema.ts'
import { FakeRuntime } from './fake-runtime.ts'

const input: StartAgentTaskInput = {
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
const inactivityTimeoutMs = 10 * 60 * 1_000

const userAddedJobPostOutput = {
    agentLabel: 'target',
    fitRationale: 'Strong TypeScript experience',
    applicationFlow: 'Direct company application',
    keyLegitimacySignals: 'Listed on the company careers page',
    recommendedResume: 'frontend',
    recommendedAction: 'Apply today',
    legitimacyNotes: null,
    post: {
        sourceKey: 'example-source:123',
        description: 'Complete example job description',
        roleTitle: 'Software Engineer',
        company: 'Example Company',
        location: 'Detroit, MI',
        compensation: '$120,000',
        techStack: 'TypeScript, Vue, Node.js',
        postSource: 'Example Source',
        postUrl: 'https://example.com/jobs/123?source=search#apply',
        applicationUrl: 'https://apply.example.com/jobs/123',
        postStatus: 'active',
    },
} as const

afterEach(() => {
    vi.useRealTimers()
})

describe('Agent task manager', () => {
    it('keeps concurrent task streams, results, and cancellation isolated', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const firstStart = manager.start(input, 'first-task')
        const secondStart = manager.start(input, 'second-task')
        const [first, second] = await Promise.all([firstStart, secondStart])
        const firstEvents: AgentTaskStreamEvent[] = []
        const secondEvents: AgentTaskStreamEvent[] = []

        manager.connect(first.id, (event) => firstEvents.push(event))
        manager.connect(second.id, (event) => secondEvents.push(event))

        expect({ threadId: first.threadId, turnId: first.turnId }).not.toEqual({
            threadId: second.threadId,
            turnId: second.turnId,
        })

        runtime.emit({
            type: 'reasoning-delta',
            threadId: first.threadId,
            turnId: first.turnId,
            itemId: 'reasoning',
            summaryIndex: 0,
            textDelta: 'First task progress',
        })
        runtime.emit({
            type: 'activity',
            threadId: second.threadId,
            turnId: second.turnId,
            activity: 'web-search',
        })
        runtime.emit({
            type: 'final-message',
            threadId: first.threadId,
            turnId: first.turnId,
            text: '{"contacts":[]}',
        })
        runtime.emit({
            type: 'turn-completed',
            threadId: first.threadId,
            turnId: first.turnId,
            status: 'completed',
            error: null,
        })

        expect(firstEvents.map(({ event }) => event.type)).toEqual(['message', 'completed'])
        expect(secondEvents.map(({ event }) => event.type)).toEqual(['activity'])
        expect(manager.get(first.id)).toMatchObject({
            status: 'completed',
            output: { contacts: [] },
        })
        expect(manager.get(second.id)).toMatchObject({
            status: 'running',
            output: null,
        })

        await manager.cancel(second.id)

        expect(runtime.interruptions).toEqual([
            { threadId: second.threadId, turnId: second.turnId },
        ])
        expect(manager.get(second.id)).toMatchObject({ status: 'cancelled', output: null })
        expect(firstEvents.map(({ event }) => event.type)).toEqual(['message', 'completed'])
        expect(secondEvents.map(({ event }) => event.type)).toEqual(['activity', 'cancelled'])
    })

    it('routes concurrent permission requests to their exact task', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const [first, second] = await Promise.all([
            manager.start(input, 'first-task'),
            manager.start(input, 'second-task'),
        ])
        const firstPermissionId = 'first-permission'
        const secondPermissionId = 'second-permission'

        runtime.emit({
            type: 'permission-required',
            permission: {
                id: firstPermissionId,
                kind: 'browser-origin',
                threadId: first.threadId,
                turnId: first.turnId,
                message: 'Allow the first browser origin?',
                origin: 'https://first.example.com',
            },
        })
        runtime.emit({
            type: 'permission-required',
            permission: {
                id: secondPermissionId,
                kind: 'browser-origin',
                threadId: second.threadId,
                turnId: second.turnId,
                message: 'Allow the second browser origin?',
                origin: 'https://second.example.com',
            },
        })

        expect(manager.resolvePermission(first.id, secondPermissionId, 'approve')).toBe(false)
        expect(manager.resolvePermission(second.id, firstPermissionId, 'decline')).toBe(false)
        expect(manager.resolvePermission(first.id, firstPermissionId, 'approve')).toBe(true)
        expect(manager.resolvePermission(second.id, secondPermissionId, 'decline')).toBe(true)
        expect(runtime.decisions).toEqual([
            { permissionId: firstPermissionId, decision: 'approve' },
            { permissionId: secondPermissionId, decision: 'decline' },
        ])
    })

    it('declines browser permission for a task without Chrome access', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const started = await manager.start({ ...input, capabilities: [] })
        const connection = manager.connect(started.id, () => {})

        runtime.emit({
            type: 'permission-required',
            permission: {
                id: 'unexpected-permission',
                kind: 'browser-origin',
                threadId: started.threadId,
                turnId: started.turnId,
                message: 'Allow an unexpected browser origin?',
                origin: 'https://example.com',
            },
        })

        expect(runtime.decisions).toEqual([
            { permissionId: 'unexpected-permission', decision: 'decline' },
        ])
        expect(connection?.events.some(({ event }) => event.type === 'permission-required')).toBe(
            false,
        )
    })

    it('delivers live events only while a listener is subscribed', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const started = await manager.start(input)
        const streamedEvents: AgentTaskStreamEvent[] = []
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
        const manager = new AgentTaskManager(runtime)
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
                outcome: 'contact',
                contact: {
                    personName: 'Ada Lovelace',
                    personTitle: 'Engineering Manager',
                    profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
                    email: 'ada@example.com',
                    relevanceRationale: 'Her visible role aligns with the team.',
                    draftMessage: 'Hi Ada, could I ask about the team?',
                },
                error: null,
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
        ['user-added job post', createUserAddedJobPostOutputSchema, userAddedJobPostOutput],
    ] as const)(
        'accepts output satisfying the generated %s contract',
        async (_name, createOutputSchema, output) => {
            const runtime = new FakeRuntime()
            const manager = new AgentTaskManager(runtime)
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

    it('rejects report-only fields from the generated user-added post contract', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const started = await manager.start({
            ...input,
            outputSchema: createUserAddedJobPostOutputSchema(),
        })

        runtime.emit({
            type: 'final-message',
            ...eventIdentity,
            text: JSON.stringify({ ...userAddedJobPostOutput, agentRank: 1 }),
        })
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

    it('rejects malformed URLs from the generated user-added post contract', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const started = await manager.start({
            ...input,
            outputSchema: createUserAddedJobPostOutputSchema(),
        })

        runtime.emit({
            type: 'final-message',
            ...eventIdentity,
            text: JSON.stringify({
                ...userAddedJobPostOutput,
                post: { ...userAddedJobPostOutput.post, postUrl: 'https://%' },
            }),
        })
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
        const manager = new AgentTaskManager(runtime)

        await expect(
            manager.start({
                ...input,
                outputSchema: outputSchema as StartAgentTaskInput['outputSchema'],
            }),
        ).rejects.toBeInstanceOf(InvalidAgentOutputSchemaError)
        expect(runtime.startAttempts).toBe(0)
    })

    it('marks boundaries between fragmented reasoning summary sections', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
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
        const manager = new AgentTaskManager(runtime)
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
        const manager = new AgentTaskManager(runtime)
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
        const manager = new AgentTaskManager(runtime)
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
        const manager = new AgentTaskManager(runtime)
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

    it('fails and interrupts a task after the inactivity timeout', async () => {
        vi.useFakeTimers()
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const started = await manager.start(input)

        await vi.advanceTimersByTimeAsync(inactivityTimeoutMs)

        expect(manager.get(started.id)).toMatchObject({
            status: 'failed',
            output: null,
            error: 'Agent task produced no activity for 10 minutes',
        })
        expect(runtime.interruptions).toEqual([
            { threadId: started.threadId, turnId: started.turnId },
        ])
        expect(manager.connect(started.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'failed',
            error: 'Agent task produced no activity for 10 minutes',
        })
    })

    it('restarts the inactivity timeout when the runtime reports activity', async () => {
        vi.useFakeTimers()
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const started = await manager.start(input)

        await vi.advanceTimersByTimeAsync(inactivityTimeoutMs - 1_000)
        runtime.emit({ type: 'activity', ...eventIdentity, activity: 'web-search' })
        await vi.advanceTimersByTimeAsync(inactivityTimeoutMs - 1_000)

        expect(manager.get(started.id)?.status).toBe('running')

        await vi.advanceTimersByTimeAsync(1_000)

        expect(manager.get(started.id)?.status).toBe('failed')
    })

    it('pauses the inactivity timeout while permission requires user action', async () => {
        vi.useFakeTimers()
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const started = await manager.start(input)
        const permissionId = 'permission-id'

        await vi.advanceTimersByTimeAsync(inactivityTimeoutMs - 1_000)
        runtime.emit({
            type: 'permission-required',
            permission: {
                id: permissionId,
                kind: 'browser-origin',
                ...eventIdentity,
                message: 'Allow the browser origin?',
                origin: 'https://example.com',
            },
        })
        await vi.advanceTimersByTimeAsync(inactivityTimeoutMs * 2)

        expect(manager.get(started.id)?.status).toBe('running')

        runtime.emit({
            type: 'permission-resolved',
            threadId: started.threadId,
            permissionId,
        })
        await vi.advanceTimersByTimeAsync(inactivityTimeoutMs)

        expect(manager.get(started.id)?.status).toBe('failed')
    })

    it('coalesces concurrent cancellation requests', async () => {
        let finishInterrupt = () => {}
        const runtime = new FakeRuntime(
            () =>
                new Promise<void>((resolve) => {
                    finishInterrupt = resolve
                }),
        )
        const manager = new AgentTaskManager(runtime)
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
        const manager = new AgentTaskManager(runtime)
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
        const manager = new AgentTaskManager(runtime)
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
        const manager = new AgentTaskManager(runtime)
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
        const manager = new AgentTaskManager(runtime)
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
        const failure = {
            type: 'runtime-failed',
            error: new Error('Agent runtime exited'),
        } as const

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
            error: 'Agent runtime exited',
        })
        expect(
            manager
                .connect(running.id, () => {})
                ?.events.filter(({ event }) => event.type === 'failed'),
        ).toHaveLength(1)
    })
})
