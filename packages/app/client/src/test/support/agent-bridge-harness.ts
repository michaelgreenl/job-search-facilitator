import type { AgentTask, AgentTaskEvent, JsonObject } from '@job-search-facilitator/core'
import { vi } from 'vitest'
import { FakeEventSource } from './fake-event-source'
import { jsonResponse, requestParts } from './http'

type FetchFallback = (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>

interface RestoreFailure {
    error: string
    status: number
}

interface AgentBridgeHarnessOptions {
    fallback?: FetchFallback
}

const agentBridgeOrigin = 'http://localhost:3001'
const createdAt = '2026-07-20T12:00:00.000Z'

export class AgentBridgeHarness {
    readonly requests: Array<{ method: string; url: string }> = []
    readonly tasks = new Map<string, AgentTask>()
    readonly fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        this.handleRequest(input, init),
    )

    private readonly fallback?: FetchFallback
    private readonly restoreFailures = new Map<string, RestoreFailure>()

    constructor({ fallback }: AgentBridgeHarnessOptions = {}) {
        this.fallback = fallback
    }

    seedTask(task: AgentTask) {
        this.tasks.set(task.id, task)
    }

    failRestore(taskId: string, error: string, status = 503) {
        this.restoreFailures.set(taskId, { error, status })
    }

    clearRequests() {
        this.requests.length = 0
    }

    complete(taskId: string, output: JsonObject) {
        const task = this.requireTask(taskId)
        const completedTask: AgentTask = {
            ...task,
            status: 'completed',
            output,
            error: null,
        }

        this.tasks.set(taskId, completedTask)
        this.emit(taskId, { type: 'completed', output, createdAt })
        return completedTask
    }

    private requireTask(taskId: string) {
        const task = this.tasks.get(taskId)

        if (task === undefined) {
            throw new Error(`Agent task "${taskId}" does not exist`)
        }

        return task
    }

    private emit(taskId: string, event: AgentTaskEvent) {
        const source = FakeEventSource.instances
            .filter(({ url }) => url.endsWith(`/tasks/${encodeURIComponent(taskId)}/events`))
            .at(-1)

        if (source === undefined) {
            throw new Error(`Agent task "${taskId}" has no event stream`)
        }

        source.message(event)
    }

    private async handleRequest(input: RequestInfo | URL, init?: RequestInit) {
        const request = requestParts(input, init)
        this.requests.push(request)
        const url = new URL(request.url)

        if (url.origin !== agentBridgeOrigin) {
            if (this.fallback !== undefined) {
                return this.fallback(input, init)
            }

            throw new Error(`Unexpected ${request.method} request: ${request.url}`)
        }

        if (request.method === 'GET' && url.pathname === '/health') {
            return jsonResponse({ status: 'healthy', capabilities: ['chrome'] })
        }

        const taskPath = url.pathname.match(/^\/tasks\/([^/]+)$/)

        if (taskPath !== null) {
            const taskId = decodeURIComponent(taskPath[1]!)

            if (request.method === 'PUT') {
                const existingTask = this.tasks.get(taskId)

                if (existingTask !== undefined) {
                    return jsonResponse(existingTask)
                }

                if (typeof init?.body !== 'string') {
                    throw new Error(`Agent task "${taskId}" requires a JSON request body`)
                }

                const task: AgentTask = {
                    id: taskId,
                    status: 'running',
                    threadId: `thread-${taskId}`,
                    turnId: `turn-${taskId}`,
                    output: null,
                    error: null,
                }
                this.tasks.set(taskId, task)
                return jsonResponse(task, 202)
            }

            if (request.method === 'GET') {
                const failure = this.restoreFailures.get(taskId)

                if (failure !== undefined) {
                    return jsonResponse({ error: failure.error }, failure.status)
                }

                const task = this.tasks.get(taskId)
                return task === undefined
                    ? jsonResponse({ error: 'Agent task not found' }, 404)
                    : jsonResponse(task)
            }
        }

        const cancelPath = url.pathname.match(/^\/tasks\/([^/]+)\/cancel$/)

        if (request.method === 'POST' && cancelPath !== null) {
            const taskId = decodeURIComponent(cancelPath[1]!)
            const task = this.requireTask(taskId)
            const cancelledTask: AgentTask = {
                ...task,
                status: 'cancelled',
                output: null,
                error: null,
            }
            this.tasks.set(taskId, cancelledTask)
            return jsonResponse(cancelledTask, 202)
        }

        throw new Error(`Unexpected ${request.method} request: ${request.url}`)
    }
}
