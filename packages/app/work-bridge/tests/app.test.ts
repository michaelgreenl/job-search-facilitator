import type {
    StartWorkTaskInput,
    WorkActionDecision,
    WorkCapability,
} from '@job-search-facilitator/core'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import type {
    AppServerNotification,
    StartedWorkTask,
    WorkRuntime,
    WorkRuntimeAction,
} from '../src/app-server.ts'
import { WorkTaskManager } from '../src/task-manager.ts'

class FakeRuntime implements WorkRuntime {
    readonly capabilities: WorkCapability[] = ['chrome']
    private readonly listeners = new Set<(notification: AppServerNotification) => void>()
    private readonly actionListeners = new Set<(action: WorkRuntimeAction) => void>()
    readonly decisions: Array<{ actionId: string; decision: WorkActionDecision }> = []

    async startTask(_taskId: string, _input: StartWorkTaskInput): Promise<StartedWorkTask> {
        return { threadId: 'thread-id', turnId: 'turn-id' }
    }

    resolveAction(actionId: string, decision: WorkActionDecision): boolean {
        this.decisions.push({ actionId, decision })
        return true
    }

    onActionRequired(listener: (action: WorkRuntimeAction) => void): () => void {
        this.actionListeners.add(listener)
        return () => this.actionListeners.delete(listener)
    }

    onNotification(listener: (notification: AppServerNotification) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    onExit(_listener: (error: Error) => void): () => void {
        return () => {}
    }

    notify(method: string, params: Record<string, unknown>) {
        for (const listener of this.listeners) {
            listener({ method, params })
        }
    }

    requireAction(action: WorkRuntimeAction) {
        for (const listener of this.actionListeners) {
            listener(action)
        }
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
        const app = createApp(
            new WorkTaskManager(runtime),
            runtime.capabilities,
            'http://localhost',
        )

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

    it('rejects an unsupported capability', async () => {
        const runtime = new FakeRuntime()
        const app = createApp(
            new WorkTaskManager(runtime),
            runtime.capabilities,
            'http://localhost',
        )

        await request(app)
            .post('/tasks')
            .send({ ...taskInput, capabilities: ['computer-use'] })
            .expect(400, { error: 'Invalid request' })
    })

    it('replays a completed task over the event stream', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const app = createApp(manager, runtime.capabilities, 'http://localhost')
        const task = await manager.start(taskInput as StartWorkTaskInput)
        const baseParams = { threadId: task.threadId, turnId: task.turnId }

        runtime.notify('item/completed', {
            ...baseParams,
            item: {
                type: 'agentMessage',
                id: 'final',
                phase: 'final_answer',
                text: '{"contacts":[]}',
            },
        })
        runtime.notify('turn/completed', {
            ...baseParams,
            turn: { id: task.turnId, status: 'completed' },
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

    it('resumes a task after its browser-origin action is approved', async () => {
        const runtime = new FakeRuntime()
        const manager = new WorkTaskManager(runtime)
        const app = createApp(manager, runtime.capabilities, 'http://localhost')
        const task = await manager.start(taskInput as StartWorkTaskInput)
        const actionId = 'b7eb7f52-d99d-42f2-84b2-d13dcf8afdc4'

        runtime.requireAction({
            id: actionId,
            kind: 'browser-origin',
            threadId: task.threadId,
            turnId: task.turnId,
            message: 'Allow Chrome to access https://www.linkedin.com?',
            origin: 'https://www.linkedin.com',
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

        runtime.notify('serverRequest/resolved', {
            threadId: task.threadId,
            requestId: 99,
            actionId,
        })

        expect(manager.connect(task.id, () => {})?.events.at(-1)?.event).toMatchObject({
            type: 'action-resolved',
            actionId,
        })
    })
})
