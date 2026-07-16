/** @vitest-environment jsdom */

import type { JobPost, UserLabel } from '@job-search-facilitator/core'
import { createPinia } from 'pinia'
import { createApp, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApplyView from '../views/ApplyView.vue'

const createPost = (id: string, userLabel: UserLabel): JobPost => ({
    id,
    sourceKey: `example:${id}`,
    roleTitle: `${userLabel} Engineer`,
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    postSource: 'Greenhouse',
    applicationUrl: `https://example.com/jobs/${id}`,
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel,
    archivedAt: null,
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
})

const posts = [
    createPost('post-p1', 'P1'),
    createPost('post-p2', 'P2'),
    createPost('post-quick-app', 'quick-app'),
]

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

const mountApplyView = async () => {
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(ApplyView)
    app.use(createPinia())
    app.mount(root)
    mountedApps.push({ app, root })

    await vi.waitFor(() => expect(root.textContent).toContain('P1 Engineer'))

    return root
}

const findButton = (root: HTMLElement, text: string) => {
    const button = [...root.querySelectorAll('button')].find((candidate) =>
        candidate.textContent?.includes(text),
    )

    if (button === undefined) {
        throw new Error(`Could not find button containing "${text}"`)
    }

    return button
}

describe('apply view', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(posts)))
    })

    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }

        vi.unstubAllGlobals()
    })

    it('filters application candidates by user label', async () => {
        const root = await mountApplyView()
        const filter = root.querySelector<HTMLSelectElement>('[aria-label="Filter job posts"]')

        if (filter === null) {
            throw new Error('Could not find job post filter')
        }

        expect([...filter.options].map(({ value }) => value)).toEqual([
            'all',
            'P1',
            'P2',
            'quick-app',
        ])

        filter.value = 'P2'
        filter.dispatchEvent(new Event('change'))

        await vi.waitFor(() => {
            expect(root.textContent).toContain('P2 Engineer')
            expect(root.textContent).not.toContain('P1 Engineer')
            expect(root.textContent).not.toContain('quick-app Engineer')
        })
    })

    it('moves between the post list and viewer', async () => {
        const root = await mountApplyView()
        const list = root.querySelector('.apply-post-list')
        const viewer = root.querySelector('.apply-job-post-view')

        expect(list?.classList.contains('is-active')).toBe(true)
        expect(list?.classList.contains('is-adjacent')).toBe(false)
        expect(viewer?.classList.contains('is-active')).toBe(false)
        expect(viewer?.classList.contains('is-adjacent')).toBe(true)

        findButton(root, 'P2 Engineer').click()

        await vi.waitFor(() => {
            expect(list?.classList.contains('is-active')).toBe(false)
            expect(list?.classList.contains('is-adjacent')).toBe(true)
            expect(viewer?.classList.contains('is-active')).toBe(true)
            expect(viewer?.classList.contains('is-adjacent')).toBe(false)
        })

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job posts"]')?.click()

        await vi.waitFor(() => {
            expect(list?.classList.contains('is-active')).toBe(true)
            expect(list?.classList.contains('is-adjacent')).toBe(false)
            expect(viewer?.classList.contains('is-active')).toBe(false)
            expect(viewer?.classList.contains('is-adjacent')).toBe(true)
        })
    })

    it('keeps the loaded list visible when a label update fails', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock
            .mockReset()
            .mockResolvedValueOnce(jsonResponse(posts))
            .mockResolvedValueOnce(jsonResponse({}, 500))
        const root = await mountApplyView()
        const labelPicker = root.querySelector<HTMLSelectElement>('[aria-label="Job post label"]')

        if (labelPicker === null) {
            throw new Error('Could not find job post label picker')
        }

        labelPicker.value = 'P2'
        labelPicker.dispatchEvent(new Event('change'))

        await vi.waitFor(() => {
            expect(root.querySelector('[role="alert"]')?.textContent).toBe(
                'API request failed (500)',
            )
        })

        expect(root.querySelector('.apply-post-list .card-list')).not.toBeNull()
    })

    it('removes a post from Apply after it is forgone', async () => {
        const forgonePost = { ...posts[0]!, userLabel: 'forgo' as const }
        vi.mocked(fetch)
            .mockReset()
            .mockResolvedValueOnce(jsonResponse([posts[0]]))
            .mockResolvedValueOnce(jsonResponse(forgonePost))
        const root = await mountApplyView()

        findButton(root, 'P1 Engineer').click()

        const labelPicker = root.querySelector<HTMLSelectElement>('[aria-label="Job post label"]')

        if (labelPicker === null) {
            throw new Error('Could not find job post label picker')
        }

        labelPicker.value = 'forgo'
        labelPicker.dispatchEvent(new Event('change'))

        await vi.waitFor(() => {
            expect(root.querySelector('.apply-post-list')?.classList.contains('is-active')).toBe(
                true,
            )
            expect(root.querySelector('.apply-job-post-view')).toBeNull()
            expect(root.textContent).toContain('No job posts match this filter.')
        })
    })
})
