import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    parseAgentPlugins,
    type AgentPluginStatus,
    type AgentProvider,
} from '@job-search-facilitator/core'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/http/app.ts'
import { AgentPlugins, type PluginStatusReader } from '../src/plugins/agent-plugins.ts'
import type { AgentProviderRuntime } from '../src/runtime/agent-runtime.ts'
import { ProviderRouter } from '../src/runtime/provider-router.ts'
import { AgentSettingsStore } from '../src/settings/agent-settings.ts'
import { AgentTaskManager } from '../src/tasks/agent-task-manager.ts'
import { FakeRuntime } from './fake-runtime.ts'

const origin = 'http://localhost:5173'
let directory: string

class FakeProvider extends FakeRuntime implements AgentProviderRuntime {
    listModels() {
        return Promise.resolve([])
    }
}

const reports =
    (states: Record<string, AgentPluginStatus>): PluginStatusReader =>
    () =>
        Promise.resolve(new Map(Object.entries(states)))

const createPluginApp = (readers: Partial<Record<AgentProvider, PluginStatusReader>> = {}) => {
    const file = join(directory, 'agent-settings.json')
    const store = new AgentSettingsStore(file)
    const plugins = new AgentPlugins(store, {
        codex: reports({
            'chrome@openai-bundled': 'ready',
            'documents@openai-primary-runtime': 'unavailable',
        }),
        claude: reports({ 'claude-in-chrome': 'ready', 'claude.ai Gmail': 'needs-sign-in' }),
        ...readers,
    })
    const providers = new ProviderRouter(
        { codex: new FakeProvider(), claude: new FakeProvider() },
        () => store.current.provider,
        () => Promise.resolve('codex'),
        (provider, capability) => plugins.allows(provider, capability),
    )
    const app = createApp(new AgentTaskManager(providers), origin, undefined, undefined, plugins)

    return { app, file }
}

const list = async (app: ReturnType<typeof createPluginApp>['app']) =>
    parseAgentPlugins((await request(app).get('/plugins').expect(200)).body)
const states = async (app: ReturnType<typeof createPluginApp>['app']) =>
    Object.fromEntries((await list(app)).map(({ id, status }) => [id, status]))
const turn = (app: ReturnType<typeof createPluginApp>['app'], id: string, enabled: boolean) =>
    request(app).put(`/plugins/${id}`).set('Origin', origin).send({ enabled })

beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'agent-plugins-test-'))
})
afterEach(() => rmSync(directory, { recursive: true, force: true }))

describe('Agent plugins', () => {
    it('lists each plugin with the state that its provider reports', async () => {
        const { app } = createPluginApp()

        expect(await states(app)).toMatchObject({
            'codex-chrome': 'ready',
            'codex-documents': 'unavailable',
            'claude-gmail': 'needs-sign-in',
        })
    })

    it('lists a plugin that the provider does not have as not installed', async () => {
        const { app } = createPluginApp()

        expect(await states(app)).toMatchObject({ 'codex-gmail': 'not-installed' })
    })

    it('lists every plugin of a provider as unavailable when the provider cannot answer', async () => {
        const { app } = createPluginApp({ claude: () => Promise.reject(new Error('Signed out')) })

        expect(await states(app)).toMatchObject({
            'codex-chrome': 'ready',
            'claude-chrome': 'unavailable',
            'claude-gmail': 'unavailable',
        })
    })

    it('starts with only the browser plugins on', async () => {
        const { app } = createPluginApp()

        const enabled = (await list(app)).filter((plugin) => plugin.enabled)

        expect(enabled.map(({ kind }) => kind)).toEqual(['browser', 'browser'])
    })

    it('saves a switch that stays after the bridge restarts', async () => {
        const { app, file } = createPluginApp()

        const response = await turn(app, 'claude-gmail', true).expect(200)

        expect(response.body).toMatchObject({ id: 'claude-gmail', enabled: true })
        expect(new AgentSettingsStore(file).pluginEnabled('claude-gmail')).toBe(true)
    })

    it('removes the browser capability from tasks when the browser plugin is off', async () => {
        const { app } = createPluginApp()

        await turn(app, 'codex-chrome', false).expect(200)

        await request(app).get('/health').expect(200, { status: 'healthy', capabilities: [] })
    })

    it('keeps the last provider states until a refresh', async () => {
        let chrome: AgentPluginStatus = 'ready'
        const { app } = createPluginApp({
            codex: () => Promise.resolve(new Map([['chrome@openai-bundled', chrome]])),
        })
        expect(await states(app)).toMatchObject({ 'codex-chrome': 'ready' })

        chrome = 'unavailable'
        expect(await states(app)).toMatchObject({ 'codex-chrome': 'ready' })
        const refreshed = await request(app).post('/plugins/refresh').set('Origin', origin)

        expect(
            parseAgentPlugins(refreshed.body).find(({ id }) => id === 'codex-chrome'),
        ).toMatchObject({
            status: 'unavailable',
        })
    })

    it('rejects a switch for a plugin that it does not list', async () => {
        const { app } = createPluginApp()

        await turn(app, 'codex-unknown', true).expect(404)
    })

    it('rejects a change from another website', async () => {
        const { app, file } = createPluginApp()

        await request(app)
            .put('/plugins/claude-gmail')
            .set('Origin', 'https://example.com')
            .send({ enabled: true })
            .expect(403)

        expect(new AgentSettingsStore(file).pluginEnabled('claude-gmail')).toBeUndefined()
    })
})
