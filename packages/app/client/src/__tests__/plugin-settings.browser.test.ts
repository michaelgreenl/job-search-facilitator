import { expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { AgentPlugin } from '@job-search-facilitator/core'
import PluginSettings from '@/components/agent/PluginSettings.vue'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

const chrome: AgentPlugin = {
    id: 'codex-chrome',
    provider: 'codex',
    kind: 'browser',
    name: 'Chrome',
    status: 'ready',
    enabled: true,
}
const gmail: AgentPlugin = {
    id: 'claude-gmail',
    provider: 'claude',
    kind: 'mail',
    name: 'Gmail',
    status: 'ready',
    enabled: false,
}
const notInstalled: AgentPlugin = {
    ...gmail,
    id: 'codex-gmail',
    provider: 'codex',
    status: 'not-installed',
}

/** Serves the plugin list and records each switch that the page saves. */
const stubBridge = (plugins: AgentPlugin[], { failSave = false } = {}) => {
    const saved: Array<{ id: string; enabled: boolean }> = []
    const state = { plugins, refreshed: plugins }
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname
        if (!init) return Response.json(state.plugins)
        if (path.endsWith('/refresh')) return Response.json(state.refreshed)
        if (failSave) return Response.json({ error: 'Could not save.' }, { status: 503 })
        const id = path.split('/').at(-1)!
        const { enabled } = JSON.parse(init.body as string) as { enabled: boolean }
        saved.push({ id, enabled })
        return Response.json({ ...state.plugins.find((plugin) => plugin.id === id), enabled })
    })
    return { saved, state }
}

it('keeps the section hint on one line', async () => {
    stubBridge([])
    mountVue(PluginSettings)

    await page.getByRole('button', { name: 'About plugins' }).hover()

    const note = page.getByTestId('hint-note')
    await expect.element(note).toBeVisible()
    const text = document.createRange()
    text.selectNodeContents(note.element())
    expect(text.getClientRects()).toHaveLength(1)
})

it('saves the switch that the user changes', async () => {
    const { saved } = stubBridge([chrome, gmail])
    mountVue(PluginSettings)

    await page.getByTestId('plugin-switch-claude-gmail').click()

    await expect
        .element(page.getByTestId('plugin-switch-claude-gmail'))
        .toHaveAttribute('aria-checked', 'true')
    expect(saved).toEqual([{ id: 'claude-gmail', enabled: true }])
})

it('keeps the switch as it was when the save fails', async () => {
    stubBridge([gmail], { failSave: true })
    mountVue(PluginSettings)

    await page.getByTestId('plugin-switch-claude-gmail').click()

    await expect.element(page.getByRole('alert')).toBeVisible()
    await expect
        .element(page.getByTestId('plugin-switch-claude-gmail'))
        .toHaveAttribute('aria-checked', 'false')
})

it('disables the switch of a plugin that is not installed', async () => {
    stubBridge([notInstalled])
    mountVue(PluginSettings)

    await expect.element(page.getByTestId('plugin-switch-codex-gmail')).toBeDisabled()
})

it('shows the plugin states that a refresh reads', async () => {
    const { state } = stubBridge([chrome])
    state.refreshed = [{ ...chrome, status: 'unavailable' }]
    mountVue(PluginSettings)
    await expect
        .element(page.getByTestId('plugin-status-codex-chrome'))
        .toHaveAttribute('data-status', 'ready')

    await page.getByTestId('refresh-plugins').click()

    await expect
        .element(page.getByTestId('plugin-status-codex-chrome'))
        .toHaveAttribute('data-status', 'unavailable')
})
