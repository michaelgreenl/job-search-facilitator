/** @vitest-environment jsdom */

import type { OutreachContact } from '@job-search-facilitator/core'
import { describe, expect, it, vi } from 'vitest'
import OutreachContactList from '@/components/outreach/OutreachContactList.vue'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { mountVue } from '@/test/support/mount'

const contact = (overrides: Partial<OutreachContact>): OutreachContact =>
    makeOutreachContact({ id: 'contact-1', jobPostId: 'post-1', ...overrides })

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
        const { root } = mountVue(OutreachContactList, {
            props: {
                contacts: [
                    contact({ messaged: true }),
                    contact({ id: 'contact-2', personName: 'Grace Hopper' }),
                ],
                error: null,
                loading: false,
                tasks: [],
            },
        })

        expectContacts(root, ['contact-1', 'contact-2'])

        await selectFilter(root, 'messaged')
        expectContacts(root, ['contact-1'])

        await selectFilter(root, 'not-messaged')
        expectContacts(root, ['contact-2'])

        await selectFilter(root, 'all')
        expectContacts(root, ['contact-1', 'contact-2'])
    })

    it('keeps the selected contact filter after remounting', async () => {
        const props = {
            contacts: [
                contact({ messaged: true }),
                contact({ id: 'contact-2', personName: 'Grace Hopper' }),
            ],
            error: null,
            loading: false,
            tasks: [],
        }
        const first = mountVue(OutreachContactList, { props })

        await selectFilter(first.root, 'not-messaged')
        first.unmount()

        const second = mountVue(OutreachContactList, { props })
        expectContacts(second.root, ['contact-2'])
        second.unmount()
    })
})
