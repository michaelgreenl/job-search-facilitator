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

const selectFilter = async (root: HTMLElement, value: string) => {
    const trigger = root.querySelector<HTMLButtonElement>('[data-testid="contact-filter-trigger"]')

    if (trigger === null) {
        throw new Error('Could not find saved contact filter')
    }

    trigger.click()
    await vi.waitFor(() => expect(root.querySelector('[role="menu"]')).not.toBeNull())
    const option = root.querySelector<HTMLButtonElement>(
        `[data-testid="contact-filter-option-${value}"]`,
    )

    if (option === null) {
        throw new Error(`Could not find saved contact filter option "${value}"`)
    }

    option.click()
    await vi.waitFor(() => expect(root.querySelector('[role="menu"]')).toBeNull())
}

const expectContacts = (root: HTMLElement, visibleIds: string[]) => {
    for (const id of ['contact-1', 'contact-2']) {
        expect(root.querySelector(`[data-testid="outreach-contact-${id}"]`) !== null).toBe(
            visibleIds.includes(id),
        )
    }
}

describe('OutreachContactList', () => {
    it('filters saved contacts by messaged status', async () => {
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(OutreachContactList, {
            contacts: [
                contact({ messaged: true }),
                contact({ id: 'contact-2', personName: 'Grace Hopper' }),
            ],
            discovering: true,
            error: null,
            loading: false,
        })
        app.mount(root)
        mountedApps.push({ app, root })

        expectContacts(root, ['contact-1', 'contact-2'])

        await selectFilter(root, 'messaged')
        expectContacts(root, ['contact-1'])

        await selectFilter(root, 'not-messaged')
        expectContacts(root, ['contact-2'])

        await selectFilter(root, 'all')
        expectContacts(root, ['contact-1', 'contact-2'])
    })
})
