import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { AppServerConnectionHandlers } from '../src/runtime/codex/app-server-connection.ts'

const { loadResumeContext, requests } = vi.hoisted(() => ({
    loadResumeContext: vi.fn<() => Promise<string>>(),
    requests: [] as { method: string; params: Record<string, unknown> }[],
}))

vi.mock('../src/resume-context.ts', () => ({ loadResumeContext }))
vi.mock('../src/runtime/codex/isolated-home.ts', () => ({
    chromeRoot: '/plugins/chrome',
    prepareAgentHome: () => ({}),
}))
vi.mock('../src/runtime/codex/codex-runtime.ts', () => ({
    closeTaskTabs: async () => undefined,
}))
vi.mock('../src/runtime/codex/app-server-connection.ts', () => ({
    AppServerConnection: class {
        constructor(
            _binary: string,
            _cwd: string,
            private handlers: AppServerConnectionHandlers,
        ) {}
        start() {}
        close() {}
        notify() {}
        async request(method: string, params: Record<string, unknown>) {
            requests.push({ method, params })
            if (method === 'thread/start')
                return { thread: { id: 'search' }, instructionSources: [] }
            if (method === 'mcpServerStatus/list')
                return { data: [{ name: 'node_repl', tools: { js: {} } }] }
            if (method === 'turn/start') {
                this.handlers.onNotification('item/completed', {
                    threadId: 'search',
                    turnId: 'turn',
                    item: { type: 'agentMessage', phase: 'final_answer', text: 'Finished' },
                })
                this.handlers.onNotification('turn/completed', {
                    threadId: 'search',
                    turn: { id: 'turn', status: 'completed' },
                })
                return { turn: { id: 'turn' } }
            }
            return {}
        }
    },
}))

const originalArgv = process.argv
const originalExitCode = process.exitCode
let directory: string

afterEach(() => {
    process.argv = originalArgv
    process.exitCode = originalExitCode
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(directory, { recursive: true, force: true })
})

it('keeps the original search independent of resumes and gates test searches on loaded context', async () => {
    directory = mkdtempSync(join(tmpdir(), 'job-search-runner-test-'))
    mkdirSync(join(directory, 'docs/agents/job-search'), { recursive: true })
    writeFileSync(
        join(directory, 'docs/agents/job-search/automation.md'),
        'Private search workflow',
    )
    vi.stubEnv('AGENT_CWD', directory)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const run = async (...flags: string[]) => {
        vi.resetModules()
        requests.length = 0
        process.exitCode = undefined
        process.argv = ['node', 'run-job-search.ts', ...flags]
        await import('../src/run-job-search.ts')
        return {
            exitCode: process.exitCode ?? 0,
            turn: requests.find(({ method }) => method === 'turn/start')?.params,
        }
    }

    loadResumeContext.mockRejectedValue(new Error('Resume API unavailable'))
    expect(await run()).toMatchObject({
        exitCode: 0,
        turn: { input: [{ type: 'text', text: 'Private search workflow' }] },
    })
    expect(loadResumeContext).not.toHaveBeenCalled()

    loadResumeContext.mockResolvedValueOnce('Synthetic current resume evidence')
    expect(await run('--resume-library')).toMatchObject({
        exitCode: 0,
        turn: {
            input: [
                {
                    type: 'text',
                    text: expect.stringContaining('Synthetic current resume evidence'),
                },
            ],
        },
    })

    loadResumeContext.mockResolvedValueOnce('Synthetic private resume evidence')
    expect(await run('--resume-library', '--check')).toEqual({ exitCode: 0, turn: undefined })
    expect(JSON.stringify(requests)).not.toContain('Synthetic private resume evidence')

    await run('--resume-library')
    expect({ exitCode: process.exitCode, requests }).toEqual({ exitCode: 1, requests: [] })
})
