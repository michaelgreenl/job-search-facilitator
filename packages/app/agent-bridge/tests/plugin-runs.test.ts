import type { Options, Query } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it } from 'vitest'
import { createClaudeAutomationRunner } from '../src/runtime/claude/claude-automation.ts'
import { pluginOverrides } from '../src/runtime/codex/codex-plugins.ts'

const installed = (id: string, type = 'local') => ({
    id,
    installed: true,
    enabled: true,
    availability: 'AVAILABLE',
    source: { type },
})
const noApps = () => Promise.resolve([])

describe('Codex run plugins', () => {
    it('turns off an installed plugin whose switch is off', async () => {
        const overrides = await pluginOverrides(
            [installed('documents@openai-primary-runtime')],
            [{ source: 'documents@openai-primary-runtime', enabled: false }],
            noApps,
        )

        expect(overrides).toEqual({ 'plugins.documents@openai-primary-runtime.enabled': false })
    })

    it('turns off the browser runtime together with the Chrome plugin', async () => {
        const overrides = await pluginOverrides(
            [installed('chrome@openai-bundled')],
            [{ source: 'chrome@openai-bundled', enabled: false }],
            noApps,
        )

        expect(overrides).toMatchObject({ 'mcp_servers.node_repl.enabled': false })
    })

    it('turns off each app of a remote plugin', async () => {
        const overrides = await pluginOverrides(
            [installed('gmail@openai-curated-remote', 'remote')],
            [{ source: 'gmail@openai-curated-remote', enabled: false }],
            () => Promise.resolve(['mail-app']),
        )

        expect(overrides).toMatchObject({ 'apps.mail-app.enabled': false })
    })

    it('leaves a plugin alone when its switch is on or it is not installed', async () => {
        const overrides = await pluginOverrides(
            [installed('chrome@openai-bundled')],
            [
                { source: 'chrome@openai-bundled', enabled: true },
                { source: 'gmail@openai-curated-remote', enabled: false },
            ],
            noApps,
        )

        expect(overrides).toEqual({})
    })
})

describe('Claude run plugins', () => {
    const gmail = {
        type: 'claudeai-proxy' as const,
        url: 'https://mail.example.com/mcp',
        id: 'gmail',
    }

    /** Runs one automation and returns the session options that Claude received. */
    const run = async (plugins: Array<{ source: string; enabled: boolean }>) => {
        let options: Options = {}
        const runner = createClaudeAutomationRunner(
            (names) => Promise.resolve(Object.fromEntries(names.map((name) => [name, gmail]))),
            (input) => {
                options = input.options ?? {}
                return (async function* () {
                    yield { type: 'result', subtype: 'success', is_error: false, result: 'Done' }
                })() as unknown as Query
            },
        )
        await runner({
            prompt: 'Run the workflow.',
            cwd: '/workspace',
            model: null,
            plugins,
            signal: new AbortController().signal,
            onProgress: () => undefined,
        })
        return options
    }

    it('loads only the connectors that are on', async () => {
        const options = await run([
            { source: 'claude-in-chrome', enabled: true },
            { source: 'claude.ai Gmail', enabled: true },
            { source: 'claude.ai Google Docs', enabled: false },
        ])

        expect(options.strictMcpConfig).toBe(true)
        expect(options.mcpServers).toEqual({ 'claude.ai Gmail': gmail })
    })

    it('runs without Chrome when the browser plugin is off', async () => {
        const options = await run([{ source: 'claude-in-chrome', enabled: false }])

        expect(options.extraArgs).toEqual({ 'no-chrome': null })
    })
})
