/** @vitest-environment jsdom */

import type { OutreachContact } from '@job-search-facilitator/core'
import { createApp, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OutreachContactList from '@/components/outreach/OutreachContactList.vue'

const contact = (overrides: Partial<OutreachContact>): OutreachContact => ({
    id: 'contact-1',
    jobPostId: 'post-1',
    personName: 'Ada Lovelace',
    personTitle: 'Engineering Manager',
    profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
    relevanceRationale: 'Her visible role aligns with the position.',
    draftMessage: 'Hi Ada, I would value your perspective on the role.',
    messaged: false,
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
    ...overrides,
})

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

afterEach(() => {
    for (const { app, root } of mountedApps.splice(0)) {
        app.unmount()
        root.remove()
    }
})

const selectFilter = async (root: HTMLElement, label: string) => {
    const trigger = root.querySelector<HTMLButtonElement>(
        'button[aria-label="Filter saved contacts"]',
    )

    if (trigger === null) {
        throw new Error('Could not find saved contact filter')
    }

    trigger.click()
    await vi.waitFor(() => expect(root.querySelector('[role="menu"]')).not.toBeNull())
    const option = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
        ({ textContent }) => textContent?.trim() === label,
    )

    if (option === undefined) {
        throw new Error(`Could not find saved contact filter option "${label}"`)
    }

    option.click()
    await vi.waitFor(() => expect(trigger.textContent?.trim()).toBe(label))

    return option
}

describe('OutreachContactList', () => {
    it('filters saved contacts by messaged status', async () => {
        const root = document.createElement('div')
        const onShowStream = vi.fn()
        document.body.append(root)
        const app = createApp(OutreachContactList, {
            contacts: [
                contact({ messaged: true }),
                contact({ id: 'contact-2', personName: 'Grace Hopper' }),
            ],
            discovering: true,
            error: null,
            loading: false,
            onShowStream,
        })
        app.mount(root)
        mountedApps.push({ app, root })

        expect(root.textContent).toContain('Ada Lovelace')
        expect(root.textContent).toContain('Grace Hopper')

        const messagedFilter = await selectFilter(root, 'Messaged')
        expect(messagedFilter.classList.contains('app-dropdown-item-success')).toBe(true)
        expect(root.textContent).toContain('Ada Lovelace')
        expect(root.textContent).not.toContain('Grace Hopper')
        root.querySelector<HTMLButtonElement>('[aria-label="View outreach progress"]')?.click()
        expect(onShowStream).toHaveBeenCalledOnce()

        const notMessagedFilter = await selectFilter(root, 'Not Messaged')
        expect(notMessagedFilter.classList.contains('app-dropdown-item-muted')).toBe(true)
        expect(root.textContent).not.toContain('Ada Lovelace')
        expect(root.textContent).toContain('Grace Hopper')

        await selectFilter(root, 'All')
        expect(root.textContent).toContain('Ada Lovelace')
        expect(root.textContent).toContain('Grace Hopper')
    })
})
