import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSettings } from '@job-search-facilitator/core'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/http/app.ts'
import type { AgentProviderRuntime } from '../src/runtime/agent-runtime.ts'
import { ProviderRouter } from '../src/runtime/provider-router.ts'
import { AgentSettingsStore } from '../src/settings/agent-settings.ts'
import { AgentTaskManager } from '../src/tasks/agent-task-manager.ts'
import { FakeRuntime } from './fake-runtime.ts'

const origin = 'http://localhost:5173'
const directories: string[] = []

class FakeProvider extends FakeRuntime implements AgentProviderRuntime {
    constructor(private readonly model: string) {
        super()
    }

    listModels() {
        return Promise.resolve([
            { id: this.model, name: this.model, reasoningEfforts: ['low', 'high'] },
        ])
    }
}

const choice: AgentSettings = {
    provider: 'claude',
    models: {
        codex: { model: 'codex-model', reasoningEffort: 'low' },
        claude: { model: 'claude-model', reasoningEffort: 'high' },
    },
}

const createSettingsApp = () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-settings-'))
    directories.push(directory)
    const file = join(directory, 'nested/agent-settings.json')
    const store = new AgentSettingsStore(file)
    const providers = new ProviderRouter(
        { codex: new FakeProvider('codex-model'), claude: new FakeProvider('claude-model') },
        () => store.current.provider,
        () => Promise.resolve('codex'),
    )
    const app = createApp(new AgentTaskManager(providers), origin, undefined, { store, providers })

    return { app, file, store }
}

afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true })
})

describe('Agent settings', () => {
    it('lists each provider with its models', async () => {
        const { app } = createSettingsApp()

        const response = await request(app).get('/settings').expect(200)

        expect(response.body.providers).toEqual([
            {
                id: 'codex',
                available: true,
                error: null,
                models: [
                    { id: 'codex-model', name: 'codex-model', reasoningEfforts: ['low', 'high'] },
                ],
            },
            {
                id: 'claude',
                available: true,
                error: null,
                models: [
                    { id: 'claude-model', name: 'claude-model', reasoningEfforts: ['low', 'high'] },
                ],
            },
        ])
    })

    it('saves a choice that stays after the bridge restarts', async () => {
        const { app, file } = createSettingsApp()

        await request(app).put('/settings').set('Origin', origin).send(choice).expect(200)

        expect(new AgentSettingsStore(file).current).toEqual(choice)
    })

    it('rejects a reasoning effort that the model does not support', async () => {
        const { app, store } = createSettingsApp()
        const saved = store.current

        await request(app)
            .put('/settings')
            .set('Origin', origin)
            .send({
                ...choice,
                models: {
                    ...choice.models,
                    claude: { model: 'claude-model', reasoningEffort: 'ultra' },
                },
            })
            .expect(400)

        expect(store.current).toEqual(saved)
    })

    it('rejects a change from another website', async () => {
        const { app, store } = createSettingsApp()
        const saved = store.current

        await request(app)
            .put('/settings')
            .set('Origin', 'https://example.com')
            .send(choice)
            .expect(403)

        expect(store.current).toEqual(saved)
    })
})
