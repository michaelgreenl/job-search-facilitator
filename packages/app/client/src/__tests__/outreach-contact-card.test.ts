/** @vitest-environment jsdom */

import type { OutreachContact } from '@job-search-facilitator/core'
import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []

    readonly observe = vi.fn()
    readonly disconnect = vi.fn()

    constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this)
    }

    resize() {
        this.callback([], this as unknown as ResizeObserver)
    }
}

const resizeRationale = async () => {
    await vi.waitFor(() => expect(FakeResizeObserver.instances).toHaveLength(1))
    const observer = FakeResizeObserver.instances[0]

    if (observer === undefined) {
        throw new Error('Rationale was not observed')
    }

    observer.resize()
}

beforeEach(() => {
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
    for (const { app, root } of mountedApps.splice(0)) {
        app.unmount()
        root.remove()
    }

    vi.unstubAllGlobals()
})

describe('OutreachContactCard', () => {
    it('shows an editable messaged checkbox only when requested', () => {
        const root = document.createElement('div')
        const onUpdateMessaged = vi.fn()
        document.body.append(root)
        const app = createApp(OutreachContactCard, {
            contact,
            showMessagedControl: true,
            onUpdateMessaged,
        })
        app.mount(root)
        mountedApps.push({ app, root })

        const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')

        expect(checkbox?.checked).toBe(true)
        expect(root.querySelector('.messaged-status')).toBeNull()

        if (checkbox === null) {
            throw new Error('Could not find messaged checkbox')
        }

        checkbox.checked = false
        checkbox.dispatchEvent(new Event('change', { bubbles: true }))

        expect(onUpdateMessaged).toHaveBeenCalledExactlyOnceWith(false)
    })

    it('hides the rationale disclosure when the text fits within three lines', async () => {
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(OutreachContactCard, {
            contact: {
                ...contact,
                relevanceRationale: 'Her role is relevant to this opening.',
            },
        })
        app.mount(root)
        mountedApps.push({ app, root })

        const rationale = root.querySelector<HTMLElement>('.relevance-rationale')

        if (rationale === null) {
            throw new Error('Could not find contact rationale')
        }

        let scrollHeight = 96
        Object.defineProperties(rationale, {
            clientHeight: { configurable: true, get: () => 48 },
            scrollHeight: { configurable: true, get: () => scrollHeight },
        })
        await resizeRationale()

        await vi.waitFor(() => {
            expect(root.textContent).toContain('Show more')
        })

        scrollHeight = 48
        await resizeRationale()

        await vi.waitFor(() => {
            expect(
                [...root.querySelectorAll('button')].some(({ textContent }) =>
                    /^Show (more|less)$/.test(textContent?.trim() ?? ''),
                ),
            ).toBe(false)
        })
    })

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
        expect(root.querySelector('input[type="checkbox"]')).toBeNull()
        const rationale = root.querySelector<HTMLElement>('.relevance-rationale')

        if (rationale === null) {
            throw new Error('Could not find contact rationale')
        }

        expect(rationale.classList.contains('is-clamped')).toBe(true)
        Object.defineProperties(rationale, {
            clientHeight: { configurable: true, value: 48 },
            scrollHeight: { configurable: true, value: 96 },
        })
        await resizeRationale()

        await vi.waitFor(() => {
            expect(
                [...root.querySelectorAll('button')].some(
                    ({ textContent }) => textContent?.trim() === 'Show more',
                ),
            ).toBe(true)
        })

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

        await resizeRationale()
        await nextTick()
        expect(showMore.textContent).toContain('Show less')

        showMore.click()

        await vi.waitFor(() => {
            expect(showMore.textContent).toContain('Show more')
            expect(rationale.classList.contains('is-clamped')).toBe(true)
        })

        root.querySelector<HTMLButtonElement>(
            '[aria-label="Open outreach draft for Ada Lovelace"]',
        )?.click()
        expect(onSelect).toHaveBeenCalledOnce()
    })
})
