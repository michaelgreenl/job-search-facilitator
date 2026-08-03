import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { StartAgentTaskInput, AgentTaskEvent } from '@job-search-facilitator/core'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/http/app.ts'
import { AgentTaskManager } from '../src/tasks/agent-task-manager.ts'
import { FakeRuntime } from './fake-runtime.ts'

const taskInput = {
    prompt: 'Find contacts',
    outputSchema: { type: 'object' },
    capabilities: ['chrome'],
}

const parseEventStream = (body: string): Array<{ id: number; event: AgentTaskEvent }> =>
    body
        .trim()
        .split('\n\n')
        .filter((frame) => frame.length > 0)
        .map((frame) => {
            const lines = frame.split('\n')
            const id = lines.find((line) => line.startsWith('id: '))
            const data = lines.find((line) => line.startsWith('data: '))

            if (id === undefined || data === undefined) {
                throw new Error('Invalid event stream frame')
            }

            return {
                id: Number(id.slice(4)),
                event: JSON.parse(data.slice(6)) as AgentTaskEvent,
            }
        })

describe('Agent bridge routes', () => {
    it('reports available capabilities and starts a task', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new AgentTaskManager(runtime), 'http://localhost')

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

    it('reuses a client-specified task without starting the runtime twice', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new AgentTaskManager(runtime), 'http://localhost')
        const taskId = '7a669871-290f-4a3f-8874-f1d7cf0f6203'

        const first = await request(app).put(`/tasks/${taskId}`).send(taskInput).expect(202)
        const repeated = await request(app).put(`/tasks/${taskId}`).send(taskInput).expect(202)

        expect(first.body.id).toBe(taskId)
        expect(repeated.body).toEqual(first.body)
        expect(runtime.startAttempts).toBe(1)
    })

    it('reports runtime failure and refuses new tasks without hiding existing task state', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new AgentTaskManager(runtime), 'http://localhost')
        const started = await request(app).post('/tasks').send(taskInput).expect(202)

        runtime.fail(new Error('runtime unavailable'))

        await request(app).get('/health').expect(503, {
            status: 'unavailable',
            capabilities: [],
            error: 'runtime unavailable',
        })
        await request(app)
            .post('/tasks')
            .send(taskInput)
            .expect(503, { error: 'runtime unavailable' })
        await request(app)
            .get(`/tasks/${started.body.id}`)
            .expect(200, {
                ...started.body,
                status: 'failed',
                error: 'runtime unavailable',
            })
        expect(runtime.startAttempts).toBe(1)
    })

    it('returns unavailable when the runtime fails during task creation', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new AgentTaskManager(runtime), 'http://localhost')
        runtime.failNextStart(new Error('task creation failed'))

        await request(app)
            .post('/tasks')
            .send(taskInput)
            .expect(503, { error: 'task creation failed' })
    })

    it('rejects an unsupported capability', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new AgentTaskManager(runtime), 'http://localhost')

        await request(app)
            .post('/tasks')
            .send({ ...taskInput, capabilities: ['computer-use'] })
            .expect(400)
    })

    it('maps an invalid output schema to a client error before starting a task', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(new AgentTaskManager(runtime), 'http://localhost')

        await request(app)
            .post('/tasks')
            .send({
                ...taskInput,
                outputSchema: {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    type: 'object',
                },
            })
            .expect(400)

        expect(runtime.startAttempts).toBe(0)
    })

    it('streams live task events and resumes after the last received event', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const app = createApp(manager, 'http://localhost')
        const task = await manager.start(taskInput as StartAgentTaskInput)
        const eventIdentity = { threadId: task.threadId, turnId: task.turnId }

        const server = createServer(app)
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', resolve)
        })

        try {
            const { port } = server.address() as AddressInfo
            const streamUrl = `http://127.0.0.1:${port}/tasks/${task.id}/events`
            const response = await fetch(streamUrl)

            runtime.emit({ type: 'activity', ...eventIdentity, activity: 'web-search' })
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

            expect(response.headers.get('content-type')).toContain('text/event-stream')
            expect(
                parseEventStream(await response.text()).map(({ id, event }) => [id, event.type]),
            ).toEqual([
                [1, 'activity'],
                [2, 'activity'],
                [3, 'completed'],
            ])

            const resumed = await fetch(streamUrl, { headers: { 'Last-Event-ID': '2' } })

            expect(
                parseEventStream(await resumed.text()).map(({ id, event }) => [id, event.type]),
            ).toEqual([[3, 'completed']])
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error === undefined ? resolve() : reject(error)))
            })
        }
    })

    it('cancels a running task and closes its event stream with cancellation', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const app = createApp(manager, 'http://localhost')
        const task = await manager.start(taskInput as StartAgentTaskInput)

        const cancellation = await request(app).post(`/tasks/${task.id}/cancel`).expect(202)

        expect(cancellation.body).toMatchObject({ id: task.id, status: 'cancelled' })

        const stream = await request(app).get(`/tasks/${task.id}/events`).expect(200)
        const eventTypes = parseEventStream(stream.text).map(({ event }) => event.type)

        expect(eventTypes).toContain('cancelled')
        expect(eventTypes).not.toContain('failed')
    })

    it('rejects cancellation after a task finishes', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const app = createApp(manager, 'http://localhost')
        const task = await manager.start(taskInput as StartAgentTaskInput)
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

        await request(app).post(`/tasks/${task.id}/cancel`).expect(409)

        expect(runtime.interruptions).toHaveLength(0)
    })

    it('resumes a task after its browser-origin permission is approved', async () => {
        const runtime = new FakeRuntime()
        const manager = new AgentTaskManager(runtime)
        const app = createApp(manager, 'http://localhost')
        const task = await manager.start(taskInput as StartAgentTaskInput)
        const permissionId = 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4'

        runtime.emit({
            type: 'permission-required',
            permission: {
                id: permissionId,
                kind: 'browser-origin',
                threadId: task.threadId,
                turnId: task.turnId,
                message: 'Allow Chrome to access https://www.linkedin.com?',
                origin: 'https://www.linkedin.com',
            },
        })

        expect(manager.connect(task.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'permission-required',
            permission: { id: permissionId },
        })

        await request(app)
            .post(`/tasks/${task.id}/permissions/${permissionId}`)
            .send({ decision: 'approve' })
            .expect(202, { status: 'accepted' })

        expect(runtime.decisions).toEqual([{ permissionId, decision: 'approve' }])

        runtime.emit({
            type: 'permission-resolved',
            threadId: task.threadId,
            permissionId,
        })

        expect(manager.connect(task.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'permission-resolved',
            permissionId,
        })
    })
})
