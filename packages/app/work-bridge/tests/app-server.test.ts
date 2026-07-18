import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { CodexAppServer } from '../src/app-server.ts'
import { WorkTaskManager } from '../src/task-manager.ts'

const createFakeProcess = (completeTaskImmediately = false) => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const requests: Array<Record<string, unknown>> = []
    let input = ''

    const respond = (message: Record<string, unknown>) => {
        stdout.write(`${JSON.stringify(message)}\n`)
    }
    const stdin = new Writable({
        write(chunk, _encoding, callback) {
            input += chunk.toString()
            const lines = input.split('\n')
            input = lines.pop() ?? ''

            for (const line of lines) {
                const request = JSON.parse(line) as Record<string, unknown>
                requests.push(request)

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

    return { process, requests, respond }
}

describe('Codex app server client', () => {
    it('discovers Chrome and starts a structured read-only task', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexAppServer('codex', '/workspace', () => fake.process)

        await runtime.start()
        const task = await runtime.startTask('task-id', {
            prompt: 'Find contacts',
            outputSchema: { type: 'object' },
            capabilities: ['chrome'],
        })

        expect(runtime.capabilities).toEqual(['chrome'])
        expect(task).toEqual({ threadId: 'thread-id', turnId: 'turn-id' })
        expect(fake.requests).toContainEqual({ method: 'initialized' })
        expect(fake.requests).toContainEqual(
            expect.objectContaining({
                method: 'thread/start',
                params: expect.objectContaining({
                    approvalPolicy: 'never',
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
                }),
            }),
        )

        runtime.close()
    })

    it('declines an unexpected command approval', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexAppServer('codex', '/workspace', () => fake.process)

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

    it('keeps terminal events emitted with the turn response', async () => {
        const fake = createFakeProcess(true)
        const runtime = new CodexAppServer('codex', '/workspace', () => fake.process)
        const manager = new WorkTaskManager(runtime)

        await runtime.start()
        const task = await manager.start({
            prompt: 'Find contacts',
            outputSchema: { type: 'object' },
            capabilities: ['chrome'],
        })
        await new Promise((resolve) => setImmediate(resolve))

        expect(manager.get(task.id)).toMatchObject({
            status: 'completed',
            output: { contacts: [] },
        })

        runtime.close()
    })

    it('reports child stdin failures through the runtime exit event', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexAppServer('codex', '/workspace', () => fake.process)

        await runtime.start()
        const exit = new Promise<Error>((resolve) => runtime.onExit(resolve))
        fake.process.stdin.emit('error', new Error('broken pipe'))

        await expect(exit).resolves.toMatchObject({ message: 'broken pipe' })
    })
})
