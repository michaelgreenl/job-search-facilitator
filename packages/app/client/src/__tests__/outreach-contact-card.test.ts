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

function mountContact(overrides: Partial<OutreachContact> = {}, messagedUpdating = false) {
    const root = document.createElement('div')
    const onUpdateMessaged = vi.fn()
    document.body.append(root)

    const app = createApp(OutreachContactCard, {
        contact: { ...contact, ...overrides },
        showMessagedControl: true,
        messagedUpdating,
        onUpdateMessaged,
    })
    app.mount(root)
    mountedApps.push({ app, root })

    const card = root.querySelector<HTMLElement>(`[data-testid="outreach-contact-${contact.id}"]`)
    const toggle = root.querySelector<HTMLButtonElement>(
        '[data-testid="outreach-contact-messaged-toggle"]',
    )

    if (card === null || toggle === null) {
        throw new Error('Could not mount contact status control')
    }

    return { card, onUpdateMessaged, toggle }
}

describe('OutreachContactCard', () => {
    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }
    })

    it.each([
        { current: true, next: false },
        { current: false, next: true },
    ])('emits the inverse messaged state from $current', ({ current, next }) => {
        const { onUpdateMessaged, toggle } = mountContact({ messaged: current })

        expect(toggle.getAttribute('aria-pressed')).toBe(String(current))
        toggle.click()
        expect(onUpdateMessaged).toHaveBeenCalledExactlyOnceWith(next)
    })

    it('blocks another messaged update while one is pending', () => {
        const { card, onUpdateMessaged, toggle } = mountContact({}, true)

        expect(card.getAttribute('aria-busy')).toBe('true')
        expect(toggle.disabled).toBe(true)
        toggle.click()
        expect(onUpdateMessaged).not.toHaveBeenCalled()
    })
})
