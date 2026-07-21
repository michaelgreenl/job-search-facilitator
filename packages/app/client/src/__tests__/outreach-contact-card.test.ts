/** @vitest-environment jsdom */

import type { OutreachContact } from '@job-search-facilitator/core'
import { createApp, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OutreachContactCard from '@/components/outreach/OutreachContactCard.vue'

const contact: OutreachContact = {
    id: 'contact-1',
    jobPostId: 'post-1',
    personName: 'Ada Lovelace',
    personTitle: 'Engineering Manager',
    profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
    relevanceRationale:
        'Her visible engineering leadership makes her a relevant contact for this role.',
    draftMessage: 'Hi Ada, I would value your perspective on the role.',
    messaged: true,
    createdAt: '2026-07-21T12:00:00.000Z',
    updatedAt: '2026-07-21T12:00:00.000Z',
}

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

afterEach(() => {
    for (const { app, root } of mountedApps.splice(0)) {
        app.unmount()
        root.remove()
    }
})

describe('OutreachContactCard', () => {
    it('shows messaged status and expands a saved contact rationale', async () => {
        const root = document.createElement('div')
        const onSelect = vi.fn()
        document.body.append(root)
        const app = createApp(OutreachContactCard, {
            contact,
            selectable: true,
            onSelect,
        })
        app.mount(root)
        mountedApps.push({ app, root })

        expect(root.textContent).toContain('Messaged')
        expect(root.querySelector('.relevance-rationale')?.classList.contains('is-clamped')).toBe(
            true,
        )
        const showMore = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
            ({ textContent }) => textContent?.trim() === 'Show more',
        )

        if (showMore === undefined) {
            throw new Error('Could not find rationale disclosure')
        }

        showMore.click()

        await vi.waitFor(() => {
            expect(showMore.textContent).toContain('Show less')
            expect(
                root.querySelector('.relevance-rationale')?.classList.contains('is-clamped'),
            ).toBe(false)
        })

        root.querySelector<HTMLButtonElement>(
            '[aria-label="Open outreach draft for Ada Lovelace"]',
        )?.click()
        expect(onSelect).toHaveBeenCalledOnce()
    })
})
