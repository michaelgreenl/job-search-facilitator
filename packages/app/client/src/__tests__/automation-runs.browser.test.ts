import { expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { Automation, UpdateAutomation } from '@job-search-facilitator/core'
import AutomationSettings from '@/components/AutomationSettings.vue'
import { agentSettingsState } from '@/test/fixtures/agent-settings'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

const codex: Automation = {
    id: 'search',
    name: 'Job search',
    provider: 'codex',
    status: 'PAUSED',
    scheduleEditable: true,
    schedule: { days: ['MO'], times: ['08:00'] },
    timeZone: 'America/Detroit',
    nextScheduledAt: null,
    model: { model: 'codex-fast', reasoningEffort: 'low' },
    run: null,
    revision: 'a'.repeat(64),
}
const claude: Automation = {
    ...codex,
    id: 'claude:search',
    provider: 'claude',
    status: 'ACTIVE',
    scheduleEditable: false,
    schedule: null,
    model: null,
}
const running = {
    status: 'running',
    startedAt: '2026-11-11T20:00:00.000Z',
    finishedAt: null,
    message: null,
} as const

/** Serves the automation list and records each change the page sends. */
const stubBridge = (automations: Automation[]) => {
    const requests: Array<{ path: string; body: unknown }> = []
    const state = { automations }
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        const path = decodeURIComponent(new URL(url).pathname)
        if (path === '/settings') return Response.json(agentSettingsState)
        if (!init) return Response.json(state.automations)
        requests.push({ path, body: init.body ? JSON.parse(init.body as string) : null })
        const id = path.split('/')[2]!
        const current = state.automations.find((automation) => automation.id === id)!
        const saved: Automation = path.endsWith('/run')
            ? { ...current, run: running }
            : path.endsWith('/cancel')
              ? {
                    ...current,
                    run: { ...running, status: 'cancelled', finishedAt: running.startedAt },
                }
              : { ...current, ...(JSON.parse(init.body as string) as UpdateAutomation) }
        state.automations = state.automations.map((item) => (item.id === id ? saved : item))
        return Response.json(saved)
    })
    return { requests, state }
}

it('shows which provider runs each automation', async () => {
    stubBridge([codex, claude])
    mountVue(AutomationSettings)

    await expect
        .element(page.getByTestId('provider-search'))
        .toHaveAttribute('data-provider', 'codex')
    await expect
        .element(page.getByTestId('provider-claude:search'))
        .toHaveAttribute('data-provider', 'claude')
})

it('starts an automation and then stops it', async () => {
    const { requests } = stubBridge([codex])
    mountVue(AutomationSettings)

    await page.getByTestId('run-toggle-search').click()
    await expect.element(page.getByTestId('run-search')).toHaveAttribute('data-status', 'running')
    await page.getByTestId('run-toggle-search').click()

    await expect.element(page.getByTestId('run-search')).toHaveAttribute('data-status', 'cancelled')
    expect(requests.map(({ path }) => path)).toEqual([
        '/automations/search/run',
        '/automations/search/run/cancel',
    ])
})

it('follows a running automation until it finishes', async () => {
    const { state } = stubBridge([{ ...codex, run: running }])
    mountVue(AutomationSettings)
    await expect.element(page.getByTestId('run-search')).toHaveAttribute('data-status', 'running')

    state.automations = [
        { ...codex, run: { ...running, status: 'completed', finishedAt: running.startedAt } },
    ]

    await expect
        .element(page.getByTestId('run-search'), { timeout: 8_000 })
        .toHaveAttribute('data-status', 'completed')
})

it('saves the model that the user chooses for an automation', async () => {
    const { requests } = stubBridge([codex])
    mountVue(AutomationSettings)

    await page.getByTestId('model-search').click()
    await page.getByTestId('automation-model-trigger').click()
    await page.getByTestId('automation-model-option-codex-deep').click()
    await page.getByTestId('save-automation-model').click()

    await expect
        .poll(() => requests.at(-1)?.body)
        .toEqual({
            revision: codex.revision,
            model: { model: 'codex-deep', reasoningEffort: 'low' },
        })
})

it('offers no schedule controls when the desktop app owns the schedule', async () => {
    stubBridge([claude])
    mountVue(AutomationSettings)

    await expect.element(page.getByTestId('run-toggle-claude:search')).toBeVisible()
    await expect.element(page.getByTestId('edit-claude:search')).not.toBeInTheDocument()
    await expect.element(page.getByTestId('toggle-claude:search')).not.toBeInTheDocument()
})
