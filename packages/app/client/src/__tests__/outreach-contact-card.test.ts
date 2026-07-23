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
    it('shows an interactive messaged status in the header only when requested', () => {
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

        const statusControl = root.querySelector<HTMLButtonElement>('button[aria-pressed]')

        expect(statusControl?.closest('.contact-labels')).not.toBeNull()
        expect(statusControl?.getAttribute('aria-pressed')).toBe('true')
        expect(statusControl?.textContent).toContain('✓ Messaged')
        expect(root.querySelector('.messaged-status')).toBeNull()
        expect(root.querySelector('input[type="checkbox"]')).toBeNull()

        if (statusControl === null) {
            throw new Error('Could not find messaged status control')
        }

        statusControl.click()

        expect(onUpdateMessaged).toHaveBeenCalledExactlyOnceWith(false)
    })

    it('marks an unmessaged contact from the header status control', () => {
        const root = document.createElement('div')
        const onUpdateMessaged = vi.fn()
        document.body.append(root)
        const app = createApp(OutreachContactCard, {
            contact: { ...contact, messaged: false },
            showMessagedControl: true,
            onUpdateMessaged,
        })
        app.mount(root)
        mountedApps.push({ app, root })

        const statusControl = root.querySelector<HTMLButtonElement>('button[aria-pressed]')

        expect(statusControl?.getAttribute('aria-pressed')).toBe('false')
        expect(statusControl?.textContent?.trim()).toBe('Mark as messaged')

        statusControl?.click()

        expect(onUpdateMessaged).toHaveBeenCalledExactlyOnceWith(true)
    })

    it('disables the header status control and shows a spinner while saving', () => {
        const root = document.createElement('div')
        const onUpdateMessaged = vi.fn()
        document.body.append(root)
        const app = createApp(OutreachContactCard, {
            contact,
            showMessagedControl: true,
            messagedUpdating: true,
            onUpdateMessaged,
        })
        app.mount(root)
        mountedApps.push({ app, root })

        const statusControl = root.querySelector<HTMLButtonElement>('button[aria-pressed]')

        expect(statusControl?.disabled).toBe(true)
        expect(statusControl?.textContent?.trim()).toBe('Saving…')
        expect(statusControl?.querySelector('.loading-spinner')).not.toBeNull()

        statusControl?.click()

        expect(onUpdateMessaged).not.toHaveBeenCalled()
    })

    it('keeps the rationale toggle by itself beneath the rationale', async () => {
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(OutreachContactCard, {
            contact,
            showMessagedControl: true,
        })
        app.mount(root)
        mountedApps.push({ app, root })

        const rationale = root.querySelector<HTMLElement>('.relevance-rationale')

        if (rationale === null) {
            throw new Error('Could not find contact rationale')
        }

        Object.defineProperties(rationale, {
            clientHeight: { configurable: true, value: 48 },
            scrollHeight: { configurable: true, value: 96 },
        })
        await resizeRationale()

        await vi.waitFor(() => {
            const actionRow = root.querySelector('.contact-actions')

            expect(actionRow).not.toBeNull()
            expect(actionRow?.querySelector('.rationale-toggle')).not.toBeNull()
            expect(actionRow?.children).toHaveLength(1)
            expect(actionRow?.querySelector('button[aria-pressed]')).toBeNull()
        })
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
