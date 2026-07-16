/** @vitest-environment jsdom */

import type { JobPost, JobSearchReport } from '@job-search-facilitator/core'
import { createPinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewView from '../views/ReviewView.vue'

const createPost = (id: string, roleTitle: string): JobPost => ({
    id,
    sourceKey: `example:${id}`,
    roleTitle,
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    postSource: 'Greenhouse',
    applicationUrl: `https://example.com/jobs/${id}`,
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-15T12:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
})

const createReport = (id: string, summary: string, post: JobPost): JobSearchReport => ({
    id,
    reportDate: '2026-07-15',
    summary,
    createdAt: '2026-07-15T12:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
    archivedAt: null,
    results: [
        {
            agentRank: 1,
            agentLabel: 'target',
            fitRationale: 'Strong TypeScript fit',
            applicationFlow: 'Direct application',
            keyLegitimacySignals: 'Listed on company careers page',
            recommendedResume: 'backend-full-stack',
            recommendedAction: 'Apply',
            legitimacyNotes: null,
            post,
        },
    ],
})

const firstPost = createPost('post-1', 'Frontend Engineer')
const secondPost = createPost('post-2', 'Backend Engineer')
const firstReport = createReport('report-1', 'First report', firstPost)
const secondReport = createReport('report-2', 'Second report', secondPost)
const reports = [firstReport, secondReport]

const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })

interface MountedReview {
    app: App
    root: HTMLElement
    router: Router
}

const mountedReviews: MountedReview[] = []

const findButton = (root: HTMLElement, text: string) => {
    const button = [...root.querySelectorAll('button')].find((candidate) =>
        candidate.textContent?.includes(text),
    )

    if (button === undefined) {
        throw new Error(`Could not find button containing "${text}"`)
    }

    return button
}

const mountReview = async (initialUrl = '/') => {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: ReviewView }],
    })
    await router.push(initialUrl)
    await router.isReady()

    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(ReviewView)
    app.use(createPinia())
    app.use(router)
    app.mount(root)

    const mountedReview = { app, root, router }
    mountedReviews.push(mountedReview)

    await vi.waitFor(() => expect(root.textContent).toContain(secondReport.summary))

    return mountedReview
}

describe('review route selection', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(reports)))
        vi.stubGlobal(
            'matchMedia',
            vi.fn((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        )
    })

    afterEach(() => {
        for (const { app, root } of mountedReviews.splice(0)) {
            app.unmount()
            root.remove()
        }

        vi.unstubAllGlobals()
    })

    it('adds the selected report id to the URL', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()

        await vi.waitFor(() =>
            expect(router.currentRoute.value.query).toEqual({ reportId: secondReport.id }),
        )
    })

    it('adds the selected post id alongside its report id', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() => expect(root.textContent).toContain(secondPost.roleTitle))
        findButton(root, secondPost.roleTitle).click()

        await vi.waitFor(() =>
            expect(router.currentRoute.value.query).toEqual({
                reportId: secondReport.id,
                postId: secondPost.id,
            }),
        )
    })

    it('removes only the post id when returning to the report posts', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() => expect(root.textContent).toContain(secondPost.roleTitle))
        findButton(root, secondPost.roleTitle).click()
        await vi.waitFor(() =>
            expect(router.currentRoute.value.query).toEqual({
                reportId: secondReport.id,
                postId: secondPost.id,
            }),
        )

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job posts"]')?.click()

        await vi.waitFor(() =>
            expect(router.currentRoute.value.query).toEqual({ reportId: secondReport.id }),
        )
    })

    it('removes both ids when returning to the reports list', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() =>
            expect(router.currentRoute.value.query).toEqual({ reportId: secondReport.id }),
        )

        root.querySelector<HTMLButtonElement>('[aria-label="Back to search reports"]')?.click()

        await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({}))
    })

    it('restores the selected report and post from the URL', async () => {
        const { root } = await mountReview(`/?reportId=${secondReport.id}&postId=${secondPost.id}`)

        await vi.waitFor(() => {
            expect(root.textContent).toContain(`Selected post: ${secondPost.id}`)
            expect(findButton(root, secondReport.summary).getAttribute('aria-pressed')).toBe('true')
        })
    })

    it('restores the layout through browser back and forward navigation', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() => expect(root.textContent).toContain(secondPost.roleTitle))
        findButton(root, secondPost.roleTitle).click()
        await vi.waitFor(() =>
            expect(router.currentRoute.value.query).toEqual({
                reportId: secondReport.id,
                postId: secondPost.id,
            }),
        )

        router.back()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.query).toEqual({ reportId: secondReport.id })
            expect(root.textContent).not.toContain(`Selected post: ${secondPost.id}`)
        })

        router.back()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.query).toEqual({})
            expect(root.querySelector('[aria-label="Back to search reports"]')).toBeNull()
        })

        router.forward()
        await vi.waitFor(() =>
            expect(root.querySelector('[aria-label="Back to search reports"]')).not.toBeNull(),
        )

        router.forward()
        await vi.waitFor(() =>
            expect(root.textContent).toContain(`Selected post: ${secondPost.id}`),
        )
    })

    it('removes stale report and post ids from the URL', async () => {
        const { root, router } = await mountReview('/?reportId=missing&postId=missing')

        await vi.waitFor(() => {
            expect(router.currentRoute.value.query).toEqual({})
            expect(findButton(root, firstReport.summary).getAttribute('aria-pressed')).toBe('true')
            expect(root.textContent).not.toContain('Selected post:')
        })
    })

    it('keeps a valid report id when removing a stale post id', async () => {
        const { root, router } = await mountReview(`/?reportId=${secondReport.id}&postId=missing`)

        await vi.waitFor(() => {
            expect(router.currentRoute.value.query).toEqual({ reportId: secondReport.id })
            expect(findButton(root, secondReport.summary).getAttribute('aria-pressed')).toBe('true')
            expect(root.textContent).not.toContain('Selected post:')
        })
    })
})
