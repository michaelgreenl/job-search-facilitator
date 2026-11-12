import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAutomations, type Automation } from '@job-search-facilitator/core'
import { parse, stringify } from 'smol-toml'
import request from 'supertest'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
    AutomationRuns,
    type AutomationRunInput,
    type AutomationRunner,
} from '../src/automations/automation-runs.ts'
import { createApp } from '../src/http/app.ts'
import { AgentSettingsStore } from '../src/settings/agent-settings.ts'
import { AgentTaskManager } from '../src/tasks/agent-task-manager.ts'
import { FakeRuntime } from './fake-runtime.ts'

const clientOrigin = 'http://localhost:5173'
const projectRoot = '/workspace/job-search'
const model = { model: 'chosen-model', reasoningEffort: 'low' }
let directory: string
let settings: AgentSettingsStore
let started: Array<AutomationRunInput & { finish: (result: string) => void }>

/** Records each run and leaves it running until the test finishes it. */
const runner: AutomationRunner = (input) =>
    new Promise((resolve, reject) => {
        started.push({ ...input, finish: resolve })
        input.signal.addEventListener('abort', () => reject(new Error('stopped')))
    })

const codexFile = () => join(directory, 'codex/search/automation.toml')

function writeClaudeTask(id: string, cwd: string) {
    const file = join(directory, `tasks/${id}/SKILL.md`)
    mkdirSync(join(directory, `tasks/${id}`), { recursive: true })
    writeFileSync(file, `---\nname: ${id}\n---\n\nRun the ${id} workflow.\n`)
    return { id, displayName: `Claude ${id}`, enabled: true, filePath: file, cwd }
}

const app = () =>
    createApp(new AgentTaskManager(new FakeRuntime()), clientOrigin, {
        directory: join(directory, 'codex'),
        projectRoot,
        claude: { appData: join(directory, 'claude'), settings },
        runs: new AutomationRuns({ codex: runner, claude: runner }),
    })

const list = async (server: ReturnType<typeof app>) =>
    parseAutomations((await request(server).get('/automations').expect(200)).body)
const find = async (server: ReturnType<typeof app>, id: string) =>
    (await list(server)).find((automation) => automation.id === id)!
const send = (server: ReturnType<typeof app>, path: string) =>
    request(server).post(path).set('Origin', clientOrigin)
const saveModel = (server: ReturnType<typeof app>, automation: Automation) =>
    request(server)
        .patch(`/automations/${automation.id}`)
        .set('Origin', clientOrigin)
        .send({ revision: automation.revision, model })

beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'automation-runs-test-'))
    started = []
    settings = new AgentSettingsStore(join(directory, 'agent-settings.json'))
    mkdirSync(join(directory, 'codex/search'), { recursive: true })
    writeFileSync(
        codexFile(),
        stringify({
            version: 1,
            id: 'search',
            kind: 'cron',
            name: 'Job search',
            prompt: 'Run the Codex workflow.',
            status: 'PAUSED',
            rrule: 'RRULE:FREQ=WEEKLY;BYHOUR=8;BYMINUTE=15;BYDAY=MO',
            cwds: [projectRoot],
        }),
    )
    mkdirSync(join(directory, 'claude/claude-code-sessions/account/organization'), {
        recursive: true,
    })
    writeFileSync(
        join(directory, 'claude/claude-code-sessions/account/organization/scheduled-tasks.json'),
        JSON.stringify({
            scheduledTasks: [
                writeClaudeTask('search', projectRoot),
                writeClaudeTask('other', '/workspace/other-project'),
            ],
        }),
    )
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

it('lists the Claude desktop tasks of this project beside the Codex automations', async () => {
    const automations = await list(app())

    expect(automations.map(({ id, provider }) => [id, provider])).toEqual([
        ['claude:search', 'claude'],
        ['search', 'codex'],
    ])
})

it('saves a Codex model in the automation file without changing its prompt', async () => {
    const server = app()

    await saveModel(server, await find(server, 'search')).expect(200)

    expect(parse(readFileSync(codexFile(), 'utf8'))).toMatchObject({
        model: 'chosen-model',
        reasoning_effort: 'low',
        prompt: 'Run the Codex workflow.',
    })
})

it('runs a Claude task with its saved model and the prompt from its task file', async () => {
    const server = app()
    await saveModel(server, await find(server, 'claude:search')).expect(200)

    await send(server, '/automations/claude:search/run').expect(202)

    expect(started[0]).toMatchObject({
        prompt: 'Run the search workflow.',
        cwd: projectRoot,
        model,
    })
})

it('runs a Claude task with the Agent default model when it has none of its own', async () => {
    const server = app()

    await send(server, '/automations/claude:search/run').expect(202)

    expect(started[0]!.model).toEqual(settings.current.models.claude)
})

it('does not let Settings change a schedule that the Claude desktop app owns', async () => {
    const server = app()
    const automation = await find(server, 'claude:search')

    await request(server)
        .patch('/automations/claude:search')
        .set('Origin', clientOrigin)
        .send({ revision: automation.revision, status: 'PAUSED' })
        .expect(409)
})

it('reports a run from its start to its result', async () => {
    const server = app()

    await send(server, '/automations/search/run').expect(202)
    started[0]!.onProgress('Searching the job boards')
    expect((await find(server, 'search')).run).toMatchObject({
        status: 'running',
        message: 'Searching the job boards',
    })

    started[0]!.finish('Report saved')
    await expect
        .poll(async () => (await find(server, 'search')).run)
        .toMatchObject({ status: 'completed', message: 'Report saved' })
})

it('does not start an automation that is already running', async () => {
    const server = app()
    await send(server, '/automations/search/run').expect(202)

    await send(server, '/automations/search/run').expect(409)

    expect(started).toHaveLength(1)
})

it('stops a running automation', async () => {
    const server = app()
    await send(server, '/automations/search/run').expect(202)

    await send(server, '/automations/search/run/cancel').expect(202)

    expect(started[0]!.signal.aborted).toBe(true)
    await expect.poll(async () => (await find(server, 'search')).run?.status).toBe('cancelled')
})

it('does not start a run that another website requests', async () => {
    await request(app())
        .post('/automations/search/run')
        .set('Origin', 'https://example.com')
        .expect(403)

    expect(started).toHaveLength(0)
})
