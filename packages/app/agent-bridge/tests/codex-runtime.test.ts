import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { runInNewContext } from 'node:vm'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import {
    createJobPostImportOutputSchema,
    parseJobPostImportResult,
} from '@job-search-facilitator/core'
import { describe, expect, it, vi } from 'vitest'
import * as resumeContext from '../src/resume-context.ts'
import type { AgentRuntimeEvent } from '../src/runtime/agent-runtime.ts'
import { CodexRuntime } from '../src/runtime/codex/codex-runtime.ts'
import { AgentTaskManager, type AgentTaskStreamEvent } from '../src/tasks/agent-task-manager.ts'

type BrowserResult = { isError?: boolean; content: Array<{ type: string; text?: string }> }

const createFakeProcess = ({
    completeTaskImmediately = false,
    ignoredMethods = [],
    instructionSources = [],
    browserResult = { isError: true, content: [] },
}: {
    completeTaskImmediately?: boolean
    ignoredMethods?: string[]
    instructionSources?: string[]
    browserResult?: BrowserResult | ((code: string) => Promise<BrowserResult>)
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
                                            id: 'ponytail@ponytail',
                                            installed: true,
                                            enabled: true,
                                            availability: 'AVAILABLE',
                                            source: { type: 'git', path: null },
                                        },
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
                } else if (
                    request.method === 'mcpServer/tool/call' &&
                    (request.params as { tool: string }).tool === 'js'
                ) {
                    const result =
                        typeof browserResult === 'function'
                            ? browserResult(
                                  (request.params as { arguments: { code: string } }).arguments
                                      .code,
                              )
                            : browserResult
                    void Promise.resolve(result).then((result) =>
                        respond({ id: request.id, result }),
                    )
                } else if (
                    request.method === 'thread/start' ||
                    request.method === 'thread/resume'
                ) {
                    respond({
                        id: request.id,
                        result: { thread: { id: 'thread-id' }, instructionSources },
                    })
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
                } else if (
                    request.method === 'turn/interrupt' ||
                    request.method === 'mcpServer/tool/call'
                ) {
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

const importEvaluation = {
    agentLabel: 'target',
    fitRationale: 'Documented experience fits the role.',
    applicationFlow: 'Public application form.',
    keyLegitimacySignals: 'Official employer posting.',
    recommendedResume: 'full-stack',
    recommendedAction: 'Apply with the recommended resume.',
    legitimacyNotes: null,
    post: {
        sourceKey: 'example:123',
        roleTitle: 'Software Engineer',
        company: 'Example',
        location: null,
        compensation: null,
        techStack: 'Not specified',
        postSource: 'Employer',
        postUrl: 'https://example.com/jobs/123',
        applicationUrl: 'https://example.com/jobs/123#apply',
        postStatus: 'active',
    },
}

describe('job-description capture', () => {
    it('copies text through the restricted DOM reader into the validated import without model transcription', async () => {
        const description =
            'Responsibilities\n\nBuild “software”\u00a0& tools.\n• Preserve lists.\n\nQualifications\nOne year.\n'
        const fake = createFakeProcess({
            browserResult: async (code) => {
                const content: BrowserResult['content'] = []
                await runInNewContext(`(async () => { ${code} })()`, {
                    chrome: {
                        tabs: {
                            get: async () => ({
                                url: async () => importEvaluation.post.postUrl,
                                playwright: {
                                    evaluate: async (
                                        read: (selector: string) => string,
                                        selector: string,
                                    ) =>
                                        runInNewContext(`(${read.toString()})(selector)`, {
                                            selector,
                                            // Chrome's read-only scope supplies DOM data without browser constructors.
                                            document: {
                                                querySelectorAll: (value: string) =>
                                                    value === '.job-description'
                                                        ? [
                                                              {
                                                                  innerText: description,
                                                                  querySelector: () => null,
                                                              },
                                                          ]
                                                        : [],
                                            },
                                        }),
                                },
                            }),
                        },
                    },
                    nodeRepl: { write: (text: string) => content.push({ type: 'text', text }) },
                })
                return { content }
            },
        })
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const manager = new AgentTaskManager(runtime)
        try {
            await runtime.start()
            const task = await manager.start({
                prompt: 'Import the role',
                capabilities: ['chrome'],
                captureJobDescription: true,
                outputSchema: createJobPostImportOutputSchema(),
            })
            fake.respond({
                id: 'capture',
                method: 'item/tool/call',
                params: {
                    threadId: task.threadId,
                    turnId: task.turnId,
                    tool: 'capture_job_description',
                    arguments: { tabId: '123', selector: '.job-description' },
                },
            })
            await vi.waitFor(() =>
                expect(fake.requests.find((request) => request.id === 'capture')).toBeDefined(),
            )
            const reply = fake.requests.find((request) => request.id === 'capture')?.result as {
                contentItems: [{ text: string }]
                success: boolean
            }
            const { descriptionCaptureId } = JSON.parse(reply.contentItems[0].text) as {
                descriptionCaptureId: string
            }
            const wireOutput = {
                result: {
                    ...importEvaluation,
                    post: { ...importEvaluation.post, descriptionCaptureId },
                },
            }
            fake.respond({
                method: 'item/completed',
                params: {
                    threadId: task.threadId,
                    turnId: task.turnId,
                    item: {
                        type: 'agentMessage',
                        phase: 'final_answer',
                        text: JSON.stringify(wireOutput),
                    },
                },
            })
            fake.respond({
                method: 'turn/completed',
                params: { threadId: task.threadId, turn: { id: task.turnId, status: 'completed' } },
            })
            await vi.waitFor(() => expect(manager.get(task.id)?.status).toBe('completed'))
            expect(parseJobPostImportResult(manager.get(task.id)?.output)).toEqual({
                result: { ...importEvaluation, post: { ...importEvaluation.post, description } },
            })
            const turnRequest = fake.requests.find((request) => request.method === 'turn/start')
            if (turnRequest === undefined) throw new Error('No turn request')
            const schema = (
                turnRequest.params as {
                    outputSchema: {
                        properties: {
                            result: {
                                anyOf: [
                                    {
                                        properties: {
                                            post: { properties: Record<string, unknown> }
                                        }
                                    },
                                ]
                            }
                        }
                    }
                }
            ).outputSchema
            expect(
                Object.keys(schema.properties.result.anyOf[0].properties.post.properties),
            ).not.toContain('description')
        } finally {
            runtime.close()
        }
    })

    it.each(['missing-capture', 'wrong-post'] as const)(
        'rejects an import with %s instead of using model-written description text',
        async (failure) => {
            const fake = createFakeProcess({
                browserResult: {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                description: 'Original page text',
                                sourceUrl: 'https://example.com/jobs/other',
                            }),
                        },
                    ],
                },
            })
            const runtime = new CodexRuntime('codex', '/workspace', {
                spawnProcess: () => fake.process,
            })
            const manager = new AgentTaskManager(runtime)
            try {
                await runtime.start()
                const task = await manager.start({
                    prompt: 'Import the role',
                    capabilities: ['chrome'],
                    captureJobDescription: true,
                    outputSchema: createJobPostImportOutputSchema(),
                })
                let descriptionCaptureId = '00000000-0000-4000-8000-000000000001'
                if (failure === 'wrong-post') {
                    fake.respond({
                        id: 'capture',
                        method: 'item/tool/call',
                        params: {
                            threadId: task.threadId,
                            turnId: task.turnId,
                            tool: 'capture_job_description',
                            arguments: { tabId: '123', selector: '.job-description' },
                        },
                    })
                    await vi.waitFor(() =>
                        expect(
                            fake.requests.find((request) => request.id === 'capture'),
                        ).toBeDefined(),
                    )
                    const reply = fake.requests.find((request) => request.id === 'capture')
                        ?.result as { contentItems: [{ text: string }] }
                    descriptionCaptureId = (
                        JSON.parse(reply.contentItems[0].text) as { descriptionCaptureId: string }
                    ).descriptionCaptureId
                }
                fake.respond({
                    method: 'item/completed',
                    params: {
                        threadId: task.threadId,
                        turnId: task.turnId,
                        item: {
                            type: 'agentMessage',
                            phase: 'final_answer',
                            text: JSON.stringify({
                                result: {
                                    ...importEvaluation,
                                    post: { ...importEvaluation.post, descriptionCaptureId },
                                },
                            }),
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
                await vi.waitFor(() => expect(manager.get(task.id)?.status).toBe('completed'))
                expect(parseJobPostImportResult(manager.get(task.id)?.output)).toEqual({
                    result: {
                        error:
                            failure === 'missing-capture'
                                ? 'The job description was not captured for this import. Try again.'
                                : 'The captured description does not match the job-post URL. Try again.',
                    },
                })
            } finally {
                runtime.close()
            }
        },
    )

    it('reports a browser capture failure without returning a capture reference', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        try {
            await runtime.start()
            const task = await runtime.startTask('import', {
                prompt: 'Import the role',
                capabilities: ['chrome'],
                captureJobDescription: true,
                outputSchema: createJobPostImportOutputSchema(),
            })
            fake.respond({
                id: 'capture',
                method: 'item/tool/call',
                params: {
                    threadId: task.threadId,
                    turnId: task.turnId,
                    tool: 'capture_job_description',
                    arguments: { tabId: '123', selector: '.job-description' },
                },
            })
            await vi.waitFor(() =>
                expect(fake.requests.find((request) => request.id === 'capture')).toBeDefined(),
            )
            expect(fake.requests.find((request) => request.id === 'capture')?.result).toEqual({
                success: false,
                contentItems: [
                    {
                        type: 'inputText',
                        text: 'Chrome could not capture the description. Check the tab and selector, then retry.',
                    },
                ],
            })
        } finally {
            runtime.close()
        }
    })
})

describe('Codex runtime', () => {
    it('refreshes browser settings between tasks after an app update', async () => {
        const source = mkdtempSync(join(tmpdir(), 'agent-browser-settings-'))
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
            personalCodexHome: source,
        })
        const input = {
            prompt: 'Read the supplied job post',
            outputSchema: { type: 'object' as const },
            capabilities: ['chrome' as const],
        }
        try {
            await runtime.start()
            for (const version of ['old', 'current']) {
                writeFileSync(
                    join(source, 'config.toml'),
                    `[mcp_servers.node_repl]\ncommand = "/browser/runtime"\n[mcp_servers.node_repl.env]\nNODE_REPL_TRUSTED_SERVICES = '{"browser":"/plugins/browser/${version}/scripts/browser-service.mjs"}'\n`,
                )
                await runtime.startTask(version, input)
            }
            expect(
                fake.requests
                    .filter(({ method }) => method === 'thread/start')
                    .map(
                        ({ params }) =>
                            (params as { config: Record<string, unknown> }).config[
                                'mcp_servers.node_repl'
                            ],
                    ),
            ).toEqual(
                ['old', 'current'].map((version) => ({
                    command: '/browser/runtime',
                    required: true,
                    env: {
                        NODE_REPL_TRUSTED_SERVICES: JSON.stringify({
                            browser: `/plugins/browser/${version}/scripts/browser-service.mjs`,
                        }),
                    },
                })),
            )
        } finally {
            runtime.close()
            rmSync(source, { recursive: true, force: true })
        }
    })

    it('passes loaded resume evidence to an import task and blocks evaluation when loading fails', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const load = vi
            .spyOn(resumeContext, 'loadResumeContext')
            .mockResolvedValue('Synthetic current PDF evidence')
        const input = {
            prompt: 'Evaluate the supplied role',
            outputSchema: { type: 'object' as const },
            capabilities: [],
            resumeContext: true,
        }
        try {
            await runtime.start()
            await runtime.startTask('resume-import', input)
            expect(fake.requests).toContainEqual(
                expect.objectContaining({
                    method: 'thread/start',
                    params: expect.objectContaining({
                        developerInstructions: expect.stringContaining(
                            'Synthetic current PDF evidence',
                        ),
                    }),
                }),
            )
            fake.requests.length = 0
            load.mockRejectedValueOnce(new Error('Unreadable resume'))
            await expect(runtime.startTask('failed-import', input)).rejects.toThrow(
                'Unreadable resume',
            )
            expect(fake.requests.filter(({ method }) => method === 'turn/start')).toEqual([])
        } finally {
            load.mockRestore()
            runtime.close()
        }
    })

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
            webSearch: false,
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
                    model: 'gpt-6-astra',
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
                    config: { tool_output_token_limit: 20_000, web_search: 'disabled' },
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
        expect(fake.requests.find(({ method }) => method === 'thread/start')?.params).toMatchObject(
            {
                dynamicTools: [
                    {
                        type: 'function',
                        name: 'report_progress',
                        inputSchema: {
                            type: 'object',
                            required: ['message'],
                            additionalProperties: false,
                        },
                    },
                ],
            },
        )
        const progressParams = fake.requests.find(({ method }) => method === 'thread/start')
            ?.params as {
            dynamicTools: [{ inputSchema: { properties: { message: { enum: string[] } } } }]
        }
        const messages = progressParams.dynamicTools[0].inputSchema.properties.message.enum
        expect(messages.length).toBeGreaterThan(0)
        expect(messages.every((message) => message.length <= 40)).toBe(true)
        expect(fake.requests).toContainEqual(
            expect.objectContaining({
                method: 'turn/start',
                params: expect.objectContaining({
                    clientUserMessageId: 'task-id',
                    input: [{ type: 'text', text: 'Find contacts', text_elements: [] }],
                    outputSchema: { type: 'object' },
                    effort: 'xhigh',
                    summary: 'none',
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

    it('streams connection retries without extending the task inactivity timeout', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const manager = new AgentTaskManager(runtime)
        const events: AgentTaskStreamEvent[] = []

        try {
            await runtime.start()
            const task = await manager.start({
                prompt: 'Import the job post',
                outputSchema: { type: 'object' },
                capabilities: [],
            })
            manager.connect(task.id, (event) => events.push(event))
            await vi.advanceTimersByTimeAsync(9 * 60 * 1_000)

            const message = 'Reconnecting... 2/5'
            const additionalDetails = 'Incomplete response returned, reason: content_filter'
            fake.respond({
                method: 'error',
                params: {
                    threadId: task.threadId,
                    turnId: task.turnId,
                    error: { message, additionalDetails },
                    willRetry: true,
                },
            })
            await new Promise((resolve) => setImmediate(resolve))

            expect(events.at(-1)?.event).toMatchObject({
                type: 'activity',
                message: 'Reconnecting to Agent',
            })
            expect(manager.get(task.id)?.status).toBe('running')

            await vi.advanceTimersByTimeAsync(60 * 1_000)

            expect(manager.get(task.id)?.status).toBe('failed')
            expect(fake.requests).toContainEqual(
                expect.objectContaining({
                    method: 'turn/interrupt',
                    params: { threadId: task.threadId, turnId: task.turnId },
                }),
            )
        } finally {
            runtime.close()
            vi.useRealTimers()
        }
    })

    it('streams explicit progress without leaking native reasoning, commentary, or final output', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const manager = new AgentTaskManager(runtime)
        const events: AgentTaskStreamEvent[] = []

        await runtime.start()
        const task = await manager.start({
            prompt: 'Find contacts',
            outputSchema: { type: 'object' },
            capabilities: ['chrome'],
        })
        const identity = { threadId: task.threadId, turnId: task.turnId }
        manager.connect(task.id, (event) => events.push(event))

        try {
            fake.respond({
                id: 'role-progress',
                method: 'item/tool/call',
                params: {
                    ...identity,
                    tool: 'report_progress',
                    arguments: { message: 'Reviewing job requirements' },
                },
            })
            fake.respond({
                id: 'fit-progress',
                method: 'item/tool/call',
                params: {
                    ...identity,
                    tool: 'report_progress',
                    arguments: { message: 'Assessing role fit' },
                },
            })
            fake.respond({
                id: 'foreign-progress',
                method: 'item/tool/call',
                params: {
                    ...identity,
                    turnId: 'other-turn',
                    tool: 'report_progress',
                    arguments: { message: 'Preparing the job post' },
                },
            })
            fake.respond({
                method: 'item/reasoning/summaryTextDelta',
                params: {
                    ...identity,
                    itemId: 'reasoning-1',
                    summaryIndex: 0,
                    delta: '**Handling documentation truncation**',
                },
            })
            fake.respond({
                method: 'item/reasoning/summaryTextDelta',
                params: {
                    ...identity,
                    itemId: 'reasoning-2',
                    summaryIndex: 0,
                    delta: '**Capturing full DOM text content**',
                },
            })
            fake.respond({
                method: 'item/completed',
                params: {
                    ...identity,
                    item: {
                        type: 'agentMessage',
                        phase: 'commentary',
                        text: '{"contacts":[],"status":"Checking the hiring team"}',
                    },
                },
            })
            fake.respond({
                method: 'item/completed',
                params: {
                    ...identity,
                    item: { type: 'agentMessage', phase: 'commentary', text: '  {"contacts":' },
                },
            })
            fake.respond({
                method: 'item/completed',
                params: {
                    ...identity,
                    item: {
                        id: 'commentary',
                        type: 'agentMessage',
                        phase: 'commentary',
                        text: 'I’m using the Chrome skill to inspect the posting.',
                    },
                },
            })
            await new Promise((resolve) => setImmediate(resolve))

            const progress = ['Reviewing job requirements', 'Assessing role fit'].map((textDelta) =>
                expect.objectContaining({ type: 'message', textDelta, startsNewStatement: true }),
            )
            expect(events.map(({ event }) => event)).toEqual(progress)
            expect(fake.requests).toContainEqual({
                id: 'role-progress',
                result: { contentItems: [], success: true },
            })

            fake.respond({
                method: 'item/completed',
                params: {
                    ...identity,
                    item: {
                        id: 'final',
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
            await new Promise((resolve) => setImmediate(resolve))

            expect(events.map(({ event }) => event)).toEqual([
                ...progress,
                expect.objectContaining({ type: 'completed', output: { contacts: [] } }),
            ])
        } finally {
            await manager.cancel(task.id)
            runtime.close()
        }
    })

    it.each([
        'Handling tool output truncation',
        'I’m using the Chrome skill to inspect the posting.',
        'Reviewing job requirements\nA paragraph.',
        'Reviewing the supplied role and applicant experience in detail',
        '{"message":"Reviewing the task"}',
    ])('rejects invalid progress without displaying or shortening it: %s', async (message) => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const events: AgentRuntimeEvent[] = []
        runtime.onEvent((event) => events.push(event))
        await runtime.start()
        try {
            fake.respond({
                id: 'invalid-progress',
                method: 'item/tool/call',
                params: {
                    threadId: 'thread-id',
                    turnId: 'turn-id',
                    tool: 'report_progress',
                    arguments: { message },
                },
            })
            await new Promise((resolve) => setImmediate(resolve))
            expect(fake.requests).toContainEqual({
                id: 'invalid-progress',
                result: {
                    contentItems: [expect.objectContaining({ type: 'inputText' })],
                    success: false,
                },
            })
            expect(events).toEqual([])
        } finally {
            runtime.close()
        }
    })

    it('rejects unsupported dynamic tools without emitting their arguments', async () => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const events: AgentRuntimeEvent[] = []
        runtime.onEvent((event) => events.push(event))
        await runtime.start()
        try {
            fake.respond({
                id: 'unsupported-tool',
                method: 'item/tool/call',
                params: {
                    threadId: 'thread-id',
                    turnId: 'turn-id',
                    tool: 'unknown_tool',
                    arguments: { message: 'Unexpected content' },
                },
            })
            await new Promise((resolve) => setImmediate(resolve))
            expect(fake.requests).toContainEqual({
                id: 'unsupported-tool',
                error: { code: -32601, message: 'Unsupported server request' },
            })
            expect(events).toEqual([])
        } finally {
            runtime.close()
        }
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

it('resumes the requested draft thread without creating a new conversation', async () => {
    const fake = createFakeProcess()
    const runtime = new CodexRuntime('codex', '/workspace', { spawnProcess: () => fake.process })
    await runtime.start()
    await runtime.startTask('followup', {
        threadId: 'thread-id',
        prompt: 'Use my earlier feedback',
        capabilities: [],
        outputSchema: { type: 'object' },
    })
    expect(fake.requests.find(({ method }) => method === 'thread/resume')).toMatchObject({
        params: { threadId: 'thread-id', config: { tool_output_token_limit: 20_000 } },
    })
    expect(fake.requests.some(({ method }) => method === 'thread/start')).toBe(false)
    runtime.close()
})

it('rejects inherited instruction files before an isolated agent runs', async () => {
    const fake = createFakeProcess({ instructionSources: ['/personal/AGENTS.md'] })
    const runtime = new CodexRuntime('codex', '/workspace', {
        environment: { CODEX_HOME: '/isolated' },
        spawnProcess: () => fake.process,
    })
    await runtime.start()
    await expect(
        runtime.startTask('task', {
            prompt: 'Draft a reply',
            capabilities: [],
            outputSchema: { type: 'object' },
        }),
    ).rejects.toThrow('unexpected instruction files')
    expect(fake.requests.some(({ method }) => method === 'turn/start')).toBe(false)
    runtime.close()
})

it.each(['malformed-output', 'failed-turn'] as const)(
    'closes only the browser session owned by a %s task',
    async (failure) => {
        const fake = createFakeProcess()
        const runtime = new CodexRuntime('codex', '/workspace', {
            spawnProcess: () => fake.process,
        })
        const manager = new AgentTaskManager(runtime)
        await runtime.start()
        const task = await manager.start({
            prompt: 'Find the job',
            capabilities: ['chrome'],
            outputSchema: { type: 'object' },
        })
        fake.respond({
            method: 'item/completed',
            params: {
                threadId: task.threadId,
                turnId: task.turnId,
                item: { type: 'agentMessage', phase: 'final_answer', text: 'not valid JSON' },
            },
        })
        fake.respond({
            method: 'turn/completed',
            params: {
                threadId: task.threadId,
                turn: {
                    id: task.turnId,
                    status: failure === 'failed-turn' ? 'failed' : 'completed',
                },
            },
        })
        await new Promise((resolve) => setImmediate(resolve))
        expect(manager.get(task.id)?.status).toBe('failed')
        expect(fake.requests.filter(({ method }) => method === 'mcpServer/tool/call')).toEqual([
            expect.objectContaining({
                params: {
                    threadId: task.threadId,
                    server: 'node_repl',
                    tool: 'turn_ended',
                    arguments: {
                        hook_event_name: 'Stop',
                        session_id: task.threadId,
                        turn_id: task.turnId,
                    },
                },
            }),
        ])
        runtime.close()
    },
)

it('interrupts and cleans up an active browser task before shutdown', async () => {
    const fake = createFakeProcess()
    const runtime = new CodexRuntime('codex', '/workspace', { spawnProcess: () => fake.process })
    await runtime.start()
    await runtime.startTask('task', {
        prompt: 'Read the job',
        capabilities: ['chrome'],
        outputSchema: { type: 'object' },
    })
    await runtime.shutdown()
    expect(
        fake.requests
            .filter(({ method }) => method === 'turn/interrupt' || method === 'mcpServer/tool/call')
            .map(({ method }) => method),
    ).toEqual(['turn/interrupt', 'mcpServer/tool/call'])
    expect(runtime.health.status).toBe('unavailable')
})
