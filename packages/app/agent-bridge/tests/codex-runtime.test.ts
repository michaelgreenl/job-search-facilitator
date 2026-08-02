import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import type { AgentRuntimeEvent } from '../src/runtime/agent-runtime.ts'
import { CodexRuntime } from '../src/runtime/codex/codex-runtime.ts'
import { AgentTaskManager } from '../src/tasks/agent-task-manager.ts'

const createFakeProcess = ({
    completeTaskImmediately = false,
    ignoredMethods = [],
}: {
    completeTaskImmediately?: boolean
    ignoredMethods?: string[]
} = {}) => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const requests: Array<Record<string, unknown>> = []
    let input = ''

    const respond = (message: Record<string, unknown>) => {
        stdout.write(`${JSON.stringify(message)}\n`)
    }
    const writeStderr = (message: string) => {
        stderr.write(message)
    }
    const endStdout = () => {
        stdout.end()
    }
    const stdin = new Writable({
        write(chunk, _encoding, callback) {
            input += chunk.toString()
            const lines = input.split('\n')
            input = lines.pop() ?? ''

            for (const line of lines) {
                const request = JSON.parse(line) as Record<string, unknown>
                requests.push(request)

                if (typeof request.method === 'string' && ignoredMethods.includes(request.method)) {
                    continue
                }

                if (request.method === 'initialize') {
                    respond({ id: request.id, result: {} })
                } else if (request.method === 'plugin/installed') {
                    respond({
                        id: request.id,
                        result: {
                            marketplaces: [
                                {
                                    plugins: [
                                        {
                                            id: 'chrome@openai-bundled',
                                            installed: true,
                                            enabled: true,
                                            availability: 'AVAILABLE',
                                            source: { type: 'local', path: '/plugins/chrome' },
                                        },
                                    ],
                                },
                            ],
                        },
                    })
                } else if (request.method === 'thread/start') {
                    respond({ id: request.id, result: { thread: { id: 'thread-id' } } })
                } else if (request.method === 'turn/start') {
                    const messages: Array<Record<string, unknown>> = [
                        { id: request.id, result: { turn: { id: 'turn-id' } } },
                    ]

                    if (completeTaskImmediately) {
                        messages.push(
                            {
                                method: 'item/completed',
                                params: {
                                    threadId: 'thread-id',
                                    turnId: 'turn-id',
                                    item: {
                                        type: 'agentMessage',
                                        id: 'final',
                                        phase: 'final_answer',
                                        text: '{"contacts":[]}',
                                    },
                                },
                            },
                            {
                                method: 'turn/completed',
                                params: {
                                    threadId: 'thread-id',
                                    turnId: 'turn-id',
                                    turn: { id: 'turn-id', status: 'completed' },
                                },
                            },
                        )
                    }

                    stdout.write(
                        `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
                    )
                } else if (request.method === 'turn/interrupt') {
                    respond({ id: request.id, result: {} })
                }
            }

            callback()
        },
    })
    const process = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        kill: () => true,
    }) as unknown as ChildProcessWithoutNullStreams

    return { process, requests, respond, writeStderr, endStdout }
}

describe('Codex runtime', () => {
    it('discovers Chrome and starts a structured read-only task', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })

        await runtime.start()
        const task = await runtime.startTask('task-id', {
            prompt: 'Find contacts',
            outputSchema: { type: 'object' },
            capabilities: ['chrome'],
        })

        expect(runtime.health).toEqual({
            status: 'healthy',
            capabilities: ['chrome'],
        })
        expect(task).toEqual({ threadId: 'thread-id', turnId: 'turn-id' })
        expect(fake.requests).toContainEqual({ method: 'initialized' })
        expect(fake.requests).toContainEqual(
            expect.objectContaining({
                method: 'initialize',
                params: expect.objectContaining({
                    capabilities: expect.objectContaining({
                        mcpServerOpenaiFormElicitation: true,
                    }),
                }),
            }),
        )
        expect(fake.requests).toContainEqual(
            expect.objectContaining({
                method: 'thread/start',
                params: expect.objectContaining({
                    approvalPolicy: {
                        granular: {
                            sandbox_approval: false,
                            rules: false,
                            skill_approval: false,
                            request_permissions: false,
                            mcp_elicitations: true,
                        },
                    },
                    approvalsReviewer: 'user',
                    sandbox: 'read-only',
                    selectedCapabilityRoots: [
                        {
                            id: 'chrome@openai-bundled',
                            location: {
                                type: 'environment',
                                environmentId: 'workspace',
                                path: '/plugins/chrome',
                            },
                        },
                    ],
                }),
            }),
        )
        expect(fake.requests).toContainEqual(
            expect.objectContaining({
                method: 'turn/start',
                params: expect.objectContaining({
                    clientUserMessageId: 'task-id',
                    input: [{ type: 'text', text: 'Find contacts', text_elements: [] }],
                    outputSchema: { type: 'object' },
                    summary: 'concise',
                }),
            }),
        )

        runtime.close()
    })

    it('declines an unexpected command approval', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })

        await runtime.start()
        fake.respond({
            id: 99,
            method: 'item/commandExecution/requestApproval',
            params: {},
        })

        await new Promise((resolve) => setImmediate(resolve))

        expect(fake.requests).toContainEqual({ id: 99, result: { decision: 'decline' } })

        runtime.close()
    })

    it('interrupts the active turn', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })

        await runtime.start()
        await runtime.interruptTask('thread-id', 'turn-id')

        expect(fake.requests).toContainEqual(
            expect.objectContaining({
                method: 'turn/interrupt',
                params: { threadId: 'thread-id', turnId: 'turn-id' },
            }),
        )

        runtime.close()
    })

    it('resumes a browser-origin request after the client approves it', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const events: AgentRuntimeEvent[] = []

        runtime.onEvent((event) => events.push(event))
        await runtime.start()
        fake.respond({
            id: 99,
            method: 'mcpServer/elicitation/request',
            params: {
                threadId: 'thread-id',
                turnId: 'turn-id',
                serverName: 'node_repl',
                mode: 'openai/form',
                message: 'Allow Chrome to access https://www.linkedin.com?',
                requestedSchema: {},
                _meta: {
                    connector_id: 'browser-use',
                    tool_name: 'access_browser_origin',
                    origin: 'https://www.linkedin.com',
                },
            },
        })

        await new Promise((resolve) => setImmediate(resolve))

        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            type: 'permission-required',
            permission: {
                threadId: 'thread-id',
                turnId: 'turn-id',
                message: 'Allow Chrome to access https://www.linkedin.com?',
                origin: 'https://www.linkedin.com',
            },
        })
        const permission = events[0]?.type === 'permission-required' ? events[0].permission : null
        expect(permission).not.toBeNull()
        expect(runtime.resolvePermission(permission!.id, 'approve')).toBe(true)
        expect(fake.requests).toContainEqual({
            id: 99,
            result: { action: 'accept', content: null, _meta: null },
        })
        expect(runtime.resolvePermission(permission!.id, 'approve')).toBe(true)
        expect(runtime.resolvePermission(permission!.id, 'decline')).toBe(false)
        expect(fake.requests.filter(({ id }) => id === 99)).toHaveLength(1)

        fake.respond({
            method: 'serverRequest/resolved',
            params: { threadId: 'thread-id', requestId: 99 },
        })
        await new Promise((resolve) => setImmediate(resolve))

        expect(events).toContainEqual({
            type: 'permission-resolved',
            threadId: 'thread-id',
            permissionId: permission!.id,
        })
        expect(runtime.resolvePermission(permission!.id, 'approve')).toBe(false)

        runtime.close()
    })

    it('translates supported notifications and ignores unknown notifications', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const events: AgentRuntimeEvent[] = []

        runtime.onEvent((event) => events.push(event))
        await runtime.start()
        fake.respond({
            method: 'item/started',
            params: {
                threadId: 'thread-id',
                turnId: 'turn-id',
                item: { type: 'webSearch', ignored: true },
            },
        })
        fake.respond({
            method: 'item/reasoning/summaryTextDelta',
            params: {
                threadId: 'thread-id',
                turnId: 'turn-id',
                itemId: 'reasoning-id',
                summaryIndex: 2,
                delta: 'Checking likely contacts',
            },
        })
        fake.respond({
            method: 'item/completed',
            params: {
                threadId: 'thread-id',
                turnId: 'turn-id',
                item: {
                    type: 'agentMessage',
                    phase: null,
                    text: '{"contacts":[]}',
                },
            },
        })
        fake.respond({
            method: 'turn/plan/updated',
            params: { threadId: 'thread-id', turnId: 'turn-id' },
        })
        fake.respond({
            method: 'turn/completed',
            params: {
                threadId: 'thread-id',
                turn: {
                    id: 'turn-id',
                    status: 'failed',
                    error: { message: 'Model unavailable' },
                },
            },
        })
        fake.respond({
            method: 'future/notification',
            params: { arbitrary: true },
        })

        await new Promise((resolve) => setImmediate(resolve))

        expect(events).toEqual([
            {
                type: 'activity',
                threadId: 'thread-id',
                turnId: 'turn-id',
                activity: 'web-search',
            },
            {
                type: 'reasoning-delta',
                threadId: 'thread-id',
                turnId: 'turn-id',
                itemId: 'reasoning-id',
                summaryIndex: 2,
                textDelta: 'Checking likely contacts',
            },
            {
                type: 'final-message',
                threadId: 'thread-id',
                turnId: 'turn-id',
                text: '{"contacts":[]}',
            },
            {
                type: 'activity',
                threadId: 'thread-id',
                turnId: 'turn-id',
                activity: 'plan-update',
            },
            {
                type: 'turn-completed',
                threadId: 'thread-id',
                turnId: 'turn-id',
                status: 'failed',
                error: 'Model unavailable',
            },
        ])
        expect(runtime.health.status).toBe('healthy')

        runtime.close()
    })

    it('rejects an invalid task response and becomes unavailable', async () => {
        const fake = createFakeProcess({ ignoredMethods: ['thread/start'] })
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })

        await runtime.start()
        const task = runtime.startTask('task-id', {
            prompt: 'Find contacts',
            outputSchema: { type: 'object' },
            capabilities: ['chrome'],
        })
        const request = fake.requests.find(({ method }) => method === 'thread/start')
        fake.respond({ id: request?.id, result: { thread: {} } })

        await expect(task).rejects.toThrow(
            'Agent runtime returned invalid response for "thread/start"',
        )
        expect(runtime.health).toEqual({
            status: 'unavailable',
            capabilities: [],
            error: 'Agent runtime returned invalid response for "thread/start"',
        })
    })

    it('fails closed when a recognized notification is malformed', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const events: AgentRuntimeEvent[] = []

        runtime.onEvent((event) => events.push(event))
        await runtime.start()
        fake.respond({
            method: 'turn/completed',
            params: {
                threadId: 'thread-id',
                turn: { id: 'turn-id', status: 'future-status' },
            },
        })

        await new Promise((resolve) => setImmediate(resolve))

        expect(events).toEqual([
            {
                type: 'runtime-failed',
                error: expect.objectContaining({
                    message: 'Agent runtime returned invalid "turn/completed" notification',
                }),
            },
        ])
        expect(runtime.health.status).toBe('unavailable')
    })

    it('keeps terminal events ahead of an immediate runtime exit', async () => {
        const fake = createFakeProcess({ completeTaskImmediately: true })
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const manager = new AgentTaskManager(runtime)

        await runtime.start()
        const task = await manager.start({
            prompt: 'Find contacts',
            outputSchema: { type: 'object' },
            capabilities: ['chrome'],
        })
        fake.process.emit('exit', 17, null)
        await new Promise((resolve) => setImmediate(resolve))

        expect(manager.get(task.id)).toMatchObject({
            status: 'completed',
            output: { contacts: [] },
        })
        expect(runtime.health).toEqual({
            status: 'unavailable',
            capabilities: [],
            error: 'Agent runtime exited with code 17',
        })
    })

    it('drains terminal notifications emitted after process exit', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const manager = new AgentTaskManager(runtime)

        await runtime.start()
        const task = await manager.start({
            prompt: 'Find contacts',
            outputSchema: { type: 'object' },
            capabilities: ['chrome'],
        })
        fake.process.emit('exit', 17, null)
        fake.respond({
            method: 'item/completed',
            params: {
                threadId: task.threadId,
                turnId: task.turnId,
                item: {
                    type: 'agentMessage',
                    phase: 'final_answer',
                    text: '{"contacts":[]}',
                },
            },
        })
        fake.respond({
            method: 'turn/completed',
            params: {
                threadId: task.threadId,
                turn: { id: task.turnId, status: 'completed' },
            },
        })
        fake.endStdout()
        await new Promise((resolve) => setImmediate(resolve))

        expect(manager.get(task.id)).toMatchObject({
            status: 'completed',
            output: { contacts: [] },
        })
    })

    it('fails running tasks when exited process streams never close', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
            exitDrainTimeoutMs: 10,
        })
        const manager = new AgentTaskManager(runtime)

        await runtime.start()
        const task = await manager.start({
            prompt: 'Find contacts',
            outputSchema: { type: 'object' },
            capabilities: ['chrome'],
        })
        fake.process.emit('exit', 17, null)
        await new Promise((resolve) => setTimeout(resolve, 20))
        await new Promise((resolve) => setImmediate(resolve))

        expect(manager.get(task.id)).toMatchObject({
            status: 'failed',
            error: 'Agent runtime exited with code 17',
        })
    })

    it('rejects an ambiguous JSON-RPC envelope immediately', async () => {
        const fake = createFakeProcess({ ignoredMethods: ['initialize'] })
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const start = runtime.start()
        const request = fake.requests.find(({ method }) => method === 'initialize')

        fake.respond({ id: request?.id, method: 'unexpected', result: {} })

        await expect(start).rejects.toThrow('Agent runtime returned an invalid JSON-RPC message')
    })

    it('reports stdin failure with bounded private stderr diagnostics', async () => {
        const fake = createFakeProcess()
        const diagnostics: string[] = []
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
            diagnosticSink: (message) => diagnostics.push(message),
            diagnosticBufferSize: 12,
        })

        await runtime.start()
        const exit = new Promise<Error>((resolve) =>
            runtime.onEvent((event) => {
                if (event.type === 'runtime-failed') {
                    resolve(event.error)
                }
            }),
        )
        fake.writeStderr('0123456789abcdef')
        fake.process.stdin.emit('error', new Error('broken pipe'))
        fake.writeStderr('tail')
        fake.process.emit('close', null, null)

        await expect(exit).resolves.toMatchObject({ message: 'broken pipe' })
        expect(diagnostics).toEqual(['Agent runtime stderr before failure:\n89abcdeftail'])
        runtime.close()
        expect(runtime.health).toEqual({
            status: 'unavailable',
            capabilities: [],
            error: 'broken pipe',
        })
    })

    it('becomes unavailable when the protocol output closes', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })

        await runtime.start()
        const failure = new Promise<Error>((resolve) =>
            runtime.onEvent((event) => {
                if (event.type === 'runtime-failed') {
                    resolve(event.error)
                }
            }),
        )
        fake.endStdout()

        await expect(failure).resolves.toMatchObject({
            message: 'Agent runtime protocol stream closed unexpectedly',
        })
        expect(runtime.health.status).toBe('unavailable')
    })

    it('times out a silent request and becomes unavailable', async () => {
        const fake = createFakeProcess({ ignoredMethods: ['initialize'] })
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
            requestTimeoutMs: 10,
        })

        await expect(runtime.start()).rejects.toThrow(
            'Agent runtime request "initialize" timed out after 10ms',
        )
        expect(runtime.health).toEqual({
            status: 'unavailable',
            capabilities: [],
            error: 'Agent runtime request "initialize" timed out after 10ms',
        })
    })
})
