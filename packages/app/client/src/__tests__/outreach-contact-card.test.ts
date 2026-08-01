/** @vitest-environment jsdom */

import type { OutreachContact } from '@job-search-facilitator/core'
import { describe, expect, it, vi } from 'vitest'
import OutreachContactCard from '@/components/outreach/OutreachContactCard.vue'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { mountVue } from '@/test/support/mount'

const contact: OutreachContact = makeOutreachContact({
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
})

function mountContact(overrides: Partial<OutreachContact> = {}, messagedUpdating = false) {
    const onUpdateMessaged = vi.fn()
    const { root } = mountVue(OutreachContactCard, {
        props: {
            contact: { ...contact, ...overrides },
            showMessagedControl: true,
            messagedUpdating,
            onUpdateMessaged,
        },
    })

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
