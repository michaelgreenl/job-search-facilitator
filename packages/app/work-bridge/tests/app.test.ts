import type { StartWorkTaskInput, WorkActionDecision } from '@job-search-facilitator/core'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import type {
    StartedWorkTask,
    WorkRuntime,
    WorkRuntimeEvent,
    WorkRuntimeHealth,
} from '../src/app-server.ts'
import { WorkTaskManager } from '../src/task-manager.ts'

class FakeRuntime implements WorkRuntime {
    health: WorkRuntimeHealth = { status: 'healthy', capabilities: ['chrome'] }
    startAttempts = 0
    private readonly eventListeners = new Set<(event: WorkRuntimeEvent) => void>()
    private startError: Error | null = null
    readonly decisions: Array<{ actionId: string; decision: WorkActionDecision }> = []
    readonly interruptions: Array<{ threadId: string; turnId: string }> = []

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

const taskInput = {
    prompt: 'Find contacts',
    outputSchema: { type: 'object' },
    capabilities: ['chrome'],
}

describe('Work bridge routes', () => {
    it('reports available capabilities and starts a task', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new WorkTaskManager(runtime), runtime, 'http://localhost')

        await request(app)
            .get('/health')
            .expect(200, { status: 'healthy', capabilities: ['chrome'] })

        const response = await request(app).post('/tasks').send(taskInput).expect(202)

        expect(response.body).toMatchObject({
            status: 'running',
            threadId: 'thread-id',
            turnId: 'turn-id',
        })
    })

    it('reports runtime failure and refuses new tasks without hiding existing task state', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new WorkTaskManager(runtime), runtime, 'http://localhost')
        const started = await request(app).post('/tasks').send(taskInput).expect(202)

        runtime.fail(new Error('Work runtime exited (17)'))

        await request(app).get('/health').expect(503, {
            status: 'unavailable',
            capabilities: [],
            error: 'Work runtime exited (17)',
        })
        await request(app)
            .post('/tasks')
            .send(taskInput)
            .expect(503, { error: 'Work runtime exited (17)' })
        await request(app)
            .get(`/tasks/${started.body.id}`)
            .expect(200, {
                ...started.body,
                status: 'failed',
                error: 'Work runtime exited (17)',
            })
        expect(runtime.startAttempts).toBe(1)
    })

    it('returns unavailable when the runtime fails during task creation', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new WorkTaskManager(runtime), runtime, 'http://localhost')
        runtime.failNextStart(new Error('Work runtime request "thread/start" timed out'))

        await request(app).post('/tasks').send(taskInput).expect(503, {
            error: 'Work runtime request "thread/start" timed out',
        })
    })

    it('rejects an unsupported capability', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new WorkTaskManager(runtime), runtime, 'http://localhost')

        await request(app)
            .post('/tasks')
            .send({ ...taskInput, capabilities: ['computer-use'] })
            .expect(400, { error: 'Invalid request' })
    })

    it.each([
        ['malformed', { type: 'not-a-json-schema-type' }],
        ['asynchronous', { $async: true, type: 'object' }],
        ['non-object', { type: 'array' }],
        ['dialect-marker', { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object' }],
        [
            'nested-dialect-marker',
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
            'unsupported-format',
            {
                type: 'object',
                properties: { email: { type: 'string', format: 'email' } },
            },
        ],
    ])('rejects the %s output schema before starting a task', async (_kind, outputSchema) => {
        const runtime = new FakeRuntime()
        const app = createApp(new WorkTaskManager(runtime), runtime, 'http://localhost')

        await request(app)
            .post('/tasks')
            .send({ ...taskInput, outputSchema })
            .expect(400, { error: 'Invalid request' })

        expect(runtime.startAttempts).toBe(0)
    })

    it('replays a completed task over the event stream', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const app = createApp(manager, runtime, 'http://localhost')
        const task = await manager.start(taskInput as StartWorkTaskInput)
        const eventIdentity = { threadId: task.threadId, turnId: task.turnId }

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

        const response = await request(app).get(`/tasks/${task.id}/events`).expect(200)

        expect(response.headers['content-type']).toContain('text/event-stream')
        expect(response.text).toContain('id: 1')
        expect(response.text).toContain('"type":"activity"')
        expect(response.text).toContain('"type":"completed"')

        const resumed = await request(app)
            .get(`/tasks/${task.id}/events`)
            .set('Last-Event-ID', '1')
            .expect(200)

        expect(resumed.text).not.toContain('"type":"activity"')
        expect(resumed.text).toContain('id: 2')
        expect(resumed.text).toContain('"type":"completed"')
    })

    it('cancels a running task and closes its event stream with cancellation', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const app = createApp(manager, runtime, 'http://localhost')
        const task = await manager.start(taskInput as StartWorkTaskInput)

        const cancellation = await request(app).post(`/tasks/${task.id}/cancel`).expect(202)

        expect(cancellation.body).toMatchObject({
            id: task.id,
            status: 'cancelled',
            output: null,
            error: null,
        })
        expect(runtime.interruptions).toEqual([{ threadId: task.threadId, turnId: task.turnId }])

        const stream = await request(app).get(`/tasks/${task.id}/events`).expect(200)

        expect(stream.text).toContain('"type":"cancelled"')
        expect(stream.text).not.toContain('"type":"failed"')
    })

    it('rejects cancellation after a task finishes', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const app = createApp(manager, runtime, 'http://localhost')
        const task = await manager.start(taskInput as StartWorkTaskInput)
        const eventIdentity = { threadId: task.threadId, turnId: task.turnId }

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

        await request(app)
            .post(`/tasks/${task.id}/cancel`)
            .expect(409, { error: 'Work task is not running' })

        expect(runtime.interruptions).toHaveLength(0)
    })

    it('resumes a task after its browser-origin action is approved', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const app = createApp(manager, runtime, 'http://localhost')
        const task = await manager.start(taskInput as StartWorkTaskInput)
        const actionId = 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4'

        runtime.emit({
            type: 'action-required',
            action: {
                id: actionId,
                kind: 'browser-origin',
                threadId: task.threadId,
                turnId: task.turnId,
                message: 'Allow Chrome to access https://www.linkedin.com?',
                origin: 'https://www.linkedin.com',
            },
        })

        expect(manager.connect(task.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'action-required',
            action: { id: actionId },
        })

        await request(app)
            .post(`/tasks/${task.id}/actions/${actionId}`)
            .send({ decision: 'approve' })
            .expect(202, { status: 'accepted' })

        expect(runtime.decisions).toEqual([{ actionId, decision: 'approve' }])

        runtime.emit({
            type: 'action-resolved',
            threadId: task.threadId,
            actionId,
        })

        expect(manager.connect(task.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'action-resolved',
            actionId,
        })
    })
})
