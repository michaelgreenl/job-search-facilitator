import type { Options, Query } from '@anthropic-ai/claude-agent-sdk'
import type { AgentTaskEvent, StartAgentTaskInput } from '@job-search-facilitator/core'
import { describe, expect, it } from 'vitest'
import { ClaudeRuntime } from '../src/runtime/claude/claude-runtime.ts'
import { copyDescription } from '../src/runtime/job-description.ts'
import { AgentTaskManager } from '../src/tasks/agent-task-manager.ts'

const input: StartAgentTaskInput = {
    prompt: 'Check the role',
    outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { open: { type: 'boolean' } },
        required: ['open'],
    },
    capabilities: ['chrome'],
}
const success = (output: unknown) => ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '',
    structured_output: output,
})

/** Stands in for the Claude process. Each query gets a stream the test writes to. */
const createFakeClaude = (account: Record<string, string> = { email: 'user@example.com' }) => {
    const queries: Array<{ options: Options; send: (message: unknown) => void }> = []
    const query = ({ options = {} }: { options?: Options }) => {
        const messages: unknown[] = []
        let closed = false
        let wake = () => {}
        const send = (message: unknown) => {
            messages.push(message)
            wake()
        }
        options.abortController?.signal.addEventListener('abort', () => {
            closed = true
            wake()
        })
        const stream = (async function* () {
            for (;;) {
                if (messages.length > 0) {
                    const message = messages.shift()
                    yield message
                    if ((message as { type: string }).type === 'result') return
                } else if (closed) {
                    return
                } else {
                    await new Promise<void>((resolve) => (wake = resolve))
                }
            }
        })()
        queries.push({ options, send })
        // The tab cleanup is its own short conversation.
        if (options.forkSession) send(success(undefined))

        return Object.assign(stream, {
            accountInfo: () => Promise.resolve(account),
            supportedModels: () =>
                Promise.resolve([
                    {
                        value: 'opus',
                        resolvedModel: 'claude-opus-5-5',
                        displayName: 'Opus 5.5',
                        supportedEffortLevels: ['low', 'high'],
                    },
                ]),
            mcpServerStatus: () =>
                Promise.resolve([{ name: 'claude-in-chrome', status: 'connected' }]),
            close: () => {},
        }) as unknown as Query
    }

    return { queries, query }
}

const startRuntime = async () => {
    const claude = createFakeClaude()
    const runtime = new ClaudeRuntime('/workspace', {
        selection: () => ({ model: 'claude-opus-5-5', reasoningEffort: 'high' }),
        query: claude.query,
    })
    await runtime.start()
    const manager = new AgentTaskManager(runtime)
    const task = await manager.start(input)
    const events: AgentTaskEvent[] = []
    manager.connect(task.id, ({ event }) => events.push(event))
    // The first query read the account. The second runs the task.
    const run = claude.queries[1]!

    return { claude, events, manager, run, task }
}

const allow = (run: { options: Options }, tool: string, toolInput: Record<string, unknown>) =>
    run.options.canUseTool!(tool, toolInput, {
        signal: new AbortController().signal,
        toolUseID: 'tool-use-id',
        requestId: 'request-id',
    })

describe('Claude runtime', () => {
    it('completes a task with the structured result from Claude', async () => {
        const { manager, run, task } = await startRuntime()

        run.send(success({ open: true }))

        await expect
            .poll(() => manager.get(task.id))
            .toMatchObject({ status: 'completed', output: { open: true } })
    })

    it('runs each task with the selected model and reasoning effort', async () => {
        const { run } = await startRuntime()

        expect(run.options).toMatchObject({ model: 'claude-opus-5-5', effort: 'high' })
    })

    it('waits for the user before Chrome opens a website, then remembers the approval', async () => {
        const { events, manager, run, task } = await startRuntime()

        const navigation = allow(run, 'mcp__claude-in-chrome__navigate', {
            url: 'https://jobs.example.com/roles/1',
        })
        await expect
            .poll(() => events.find((event) => event.type === 'permission-required'))
            .toBeDefined()
        const { permission } = events.find((event) => event.type === 'permission-required')!

        expect(permission.origin).toBe('https://jobs.example.com')
        manager.resolvePermission(task.id, permission.id, 'approve')
        await expect(navigation).resolves.toMatchObject({ behavior: 'allow' })
        await expect(
            allow(run, 'mcp__claude-in-chrome__navigate', {
                url: 'https://jobs.example.com/roles/2',
            }),
        ).resolves.toMatchObject({ behavior: 'allow' })
    })

    it('blocks a website the user declines', async () => {
        const { events, manager, run, task } = await startRuntime()

        const navigation = allow(run, 'mcp__claude-in-chrome__navigate', {
            url: 'https://jobs.example.com',
        })
        await expect
            .poll(() => events.find((event) => event.type === 'permission-required'))
            .toBeDefined()
        const { permission } = events.find((event) => event.type === 'permission-required')!
        manager.resolvePermission(task.id, permission.id, 'decline')

        await expect(navigation).resolves.toMatchObject({ behavior: 'deny' })
    })

    it('denies tools that the task did not request', async () => {
        const { run } = await startRuntime()

        await expect(allow(run, 'Bash', { command: 'ls' })).resolves.toMatchObject({
            behavior: 'deny',
        })
    })

    it('stops a running task and closes its browser tabs', async () => {
        const { claude, manager, task } = await startRuntime()

        await manager.cancel(task.id)

        expect(manager.get(task.id)).toMatchObject({ status: 'cancelled' })
        expect(claude.queries[2]!.options).toMatchObject({
            resume: task.threadId,
            forkSession: true,
        })
    })

    it('reports that Claude is unavailable when no account is signed in', async () => {
        const runtime = new ClaudeRuntime('/workspace', {
            selection: () => ({ model: 'claude-opus-5-5', reasoningEffort: 'high' }),
            query: createFakeClaude({ tokenSource: 'none' }).query,
        })

        await expect(runtime.start()).rejects.toThrow()

        expect(runtime.health.status).toBe('unavailable')
    })
})

describe('Description capture from page text', () => {
    const page = {
        sourceUrl: 'https://jobs.example.com/roles/1',
        text: 'Apply now\nAbout the  role\nBuild features.\nBenefits apply.\nGreat benefits apply.\nApply now',
    }

    it('copies from the first start match through the last end match', () => {
        expect(copyDescription(page, 'About the role', 'benefits apply.')).toEqual({
            sourceUrl: page.sourceUrl,
            description: 'About the  role\nBuild features.\nBenefits apply.\nGreat benefits apply.',
        })
    })

    it('copies nothing when the page text does not contain the range', () => {
        expect(copyDescription(page, 'About the team', 'benefits apply.')).toBeUndefined()
    })
})
