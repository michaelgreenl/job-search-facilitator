import { expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { AgentSettings, AgentSettingsState } from '@job-search-facilitator/core'
import AgentSettingsSection from '@/components/agent/AgentSettings.vue'
import { agentSettingsState as initial } from '@/test/fixtures/agent-settings'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

/** Serves the settings state and records each saved choice. */
const stubBridge = (state: AgentSettingsState) => {
    const saved: AgentSettings[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
        if (!init) return Response.json(state)
        const settings = JSON.parse(init.body as string) as AgentSettings
        saved.push(settings)
        return Response.json({ ...state, settings })
    })
    return saved
}

it('saves the provider that the user selects', async () => {
    const saved = stubBridge(initial)
    mountVue(AgentSettingsSection)

    await page.getByTestId('agent-provider-claude').click()

    await expect.poll(() => saved.at(-1)?.provider).toBe('claude')
})

it('changes to a supported reasoning effort when the new model lacks the current one', async () => {
    const saved = stubBridge(initial)
    mountVue(AgentSettingsSection)

    await page.getByTestId('agent-model-trigger').click()
    await page.getByTestId('agent-model-option-codex-deep').click()

    await expect
        .poll(() => saved.at(-1)?.models.codex)
        .toEqual({ model: 'codex-deep', reasoningEffort: 'high' })
})

it('does not let the user select a provider that is unavailable', async () => {
    stubBridge({
        ...initial,
        providers: [
            initial.providers[0]!,
            { id: 'claude', available: false, error: 'Claude is not signed in.', models: [] },
        ],
    })
    mountVue(AgentSettingsSection)

    await expect.element(page.getByTestId('agent-provider-claude')).toBeDisabled()
})
