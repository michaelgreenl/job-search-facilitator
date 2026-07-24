/** @vitest-environment jsdom */

import type { JobPost, JobSearchReport } from '@job-search-facilitator/core'
import { createPinia } from 'pinia'
import { createApp, type App } from 'vue'
import { createMemoryHistory, createRouter, type HistoryState, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewView from '../views/ReviewView.vue'

const createPost = (id: string, roleTitle: string): JobPost => ({
    id,
    sourceKey: `example:${id}`,
    roleTitle,
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Greenhouse',
    postUrl: `https://example.com/jobs/${id}`,
    applicationUrl: `https://apply.example.com/jobs/${id}`,
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-07-15T12:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
})

const createReport = (
    id: string,
    reportDate: string,
    summary: string,
    post: JobPost,
): JobSearchReport => ({
    id,
    reportDate,
    summary,
    createdAt: `${reportDate}T12:00:00.000Z`,
    updatedAt: `${reportDate}T12:00:00.000Z`,
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
const thirdPost = createPost('post-3', 'Platform Engineer')
const firstReport = createReport('report-1', '2026-07-10', 'First report', firstPost)
const secondReport = createReport('report-2', '2026-07-15', 'Second report', secondPost)
const thirdReport = createReport('report-3', '2026-07-15', 'Third report', thirdPost)
const reports = [firstReport, secondReport, thirdReport]

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

const getReportDateInputs = (root: HTMLElement) => {
    const from = root.querySelector<HTMLInputElement>('input[aria-label="Reports from date"]')
    const to = root.querySelector<HTMLInputElement>('input[aria-label="Reports through date"]')

    if (from === null || to === null) {
        throw new Error('Could not find report date range inputs')
    }

    return { from, to }
}

const setDateInput = (input: HTMLInputElement, value: string) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

const mountReview = async (initialUrl = '/', initialState?: HistoryState) => {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: ReviewView }],
    })
    await router.push(
        initialState === undefined ? initialUrl : { path: initialUrl, state: initialState },
    )
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

    it('keeps the selected report id out of the visible URL', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            })
        })
    })

    it('uses the shared dropdown for job post filters', async () => {
        const { root } = await mountReview()

        findButton(root, secondReport.summary).click()
        const filter = await vi.waitFor(() => {
            const button = root.querySelector<HTMLButtonElement>(
                'button[aria-label="Filter job posts"]',
            )

            if (button === null) {
                throw new Error('Could not find job post filter')
            }

            return button
        })

        expect(root.querySelector('select')).toBeNull()
        expect(filter.closest('.post-filter-dropdown')).not.toBeNull()
        filter.click()

        await vi.waitFor(() => {
            expect(
                [...root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].map((item) =>
                    item.textContent?.trim(),
                ),
            ).toEqual(['All', 'Labeled', 'Unreviewed', 'Forgone'])
        })
    })

    it('groups the date range and report count in the responsive report heading', async () => {
        const { root } = await mountReview()
        const reportPanel = root.querySelector<HTMLElement>('[aria-label="Search reports"]')

        if (reportPanel === null) {
            throw new Error('Could not find the search reports panel')
        }

        const reportHeading = reportPanel.querySelector('.report-list-heading')
        const dateFilter = reportHeading?.querySelector(
            'fieldset[aria-label="Filter reports by date"]',
        )
        const reportCount = reportHeading?.querySelector('.report-count')
        const reportList = reportPanel.querySelector('.card-list')
        const clearDates = reportHeading?.querySelector<HTMLButtonElement>(
            'button[aria-label="Clear report dates"]',
        )

        expect(reportHeading?.querySelector('header')).not.toBeNull()
        expect(dateFilter?.textContent).toContain('–')
        expect(dateFilter?.textContent).not.toContain('From')
        expect(dateFilter?.textContent).not.toContain('To')
        expect(reportCount?.textContent).toBe('3 reports')
        expect(clearDates?.disabled).toBe(true)

        if (reportCount === null || reportCount === undefined || reportList === null) {
            throw new Error('Could not find the report count or card list')
        }

        expect(
            reportCount.compareDocumentPosition(reportList) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })

    it('filters reports by an inclusive open-ended date range and clears it', async () => {
        const { root } = await mountReview()
        const { from, to } = getReportDateInputs(root)

        expect(from.value).toBe('')
        expect(to.value).toBe('')
        expect(root.textContent).toContain('3 reports')

        setDateInput(from, '2026-07-15')

        await vi.waitFor(() => {
            expect(root.textContent).not.toContain(firstReport.summary)
            expect(root.textContent).toContain(secondReport.summary)
            expect(root.textContent).toContain(thirdReport.summary)
            expect(root.textContent).toContain('2 of 3 reports')
            expect(to.min).toBe('2026-07-15')
        })

        setDateInput(to, '2026-07-15')

        await vi.waitFor(() => {
            expect(root.textContent).toContain(secondReport.summary)
            expect(root.textContent).toContain(thirdReport.summary)
            expect(from.max).toBe('2026-07-15')
        })

        setDateInput(from, '')
        setDateInput(to, '2026-07-10')

        await vi.waitFor(() => {
            expect(root.textContent).toContain(firstReport.summary)
            expect(root.textContent).not.toContain(secondReport.summary)
            expect(root.textContent).not.toContain(thirdReport.summary)
            expect(root.textContent).toContain('1 of 3 reports')
        })

        findButton(root, 'Clear').click()

        await vi.waitFor(() => {
            expect(from.value).toBe('')
            expect(to.value).toBe('')
            expect(root.textContent).toContain(firstReport.summary)
            expect(root.textContent).toContain(secondReport.summary)
            expect(root.textContent).toContain(thirdReport.summary)
            expect(root.textContent).toContain('3 reports')
            expect(root.textContent).not.toContain('of 3 reports')
        })
    })

    it('explains when no reports fall within the selected date range', async () => {
        const { root } = await mountReview()
        const { from, to } = getReportDateInputs(root)

        setDateInput(from, '2026-07-11')
        setDateInput(to, '2026-07-14')

        await vi.waitFor(() => {
            expect(root.textContent).toContain('No reports ran from 2026-07-11 through 2026-07-14.')
            expect(root.textContent).toContain('0 of 3 reports')
            expect(root.textContent).not.toContain('No search reports found.')
        })
    })

    it('keeps the selected report open when the range excludes its card', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() => {
            expect(root.textContent).toContain(secondPost.roleTitle)
            expect(router.options.history.state.reviewReportId).toBe(secondReport.id)
        })

        const { to } = getReportDateInputs(root)

        setDateInput(to, '2026-07-10')

        await vi.waitFor(() => {
            expect(root.textContent).not.toContain(secondReport.summary)
            expect(root.textContent).toContain(secondPost.roleTitle)
            expect(router.options.history.state.reviewReportId).toBe(secondReport.id)
        })
    })

    it('keeps the selected post id out of the visible URL', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() => expect(root.textContent).toContain(secondPost.roleTitle))
        findButton(root, secondPost.roleTitle).click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
                reviewPostId: secondPost.id,
            })
        })
    })

    it('shows the selected report result in the job-post viewer', async () => {
        const { root } = await mountReview()
        const result = secondReport.results[0]

        if (result === undefined) {
            throw new Error('Could not find the selected report result')
        }

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() => expect(root.textContent).toContain(secondPost.roleTitle))
        findButton(root, secondPost.roleTitle).click()

        await vi.waitFor(() => {
            const viewerText = root.querySelector('.post-viewer')?.textContent ?? ''

            expect(viewerText).toContain(result.recommendedAction)
            expect(viewerText).toContain(result.fitRationale)
            expect(viewerText).toContain(result.keyLegitimacySignals)
            expect(viewerText).toContain(secondPost.techStack)
        })
    })

    it('removes only the hidden post state when returning to the report posts', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() => expect(root.textContent).toContain(secondPost.roleTitle))
        findButton(root, secondPost.roleTitle).click()
        await vi.waitFor(() =>
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
                reviewPostId: secondPost.id,
            }),
        )

        root.querySelector<HTMLButtonElement>('[aria-label="Back to job posts"]')?.click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            })
            expect(router.options.history.state.reviewPostId).toBeUndefined()
        })
    })

    it('removes hidden selection state when returning to the reports list', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() =>
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            }),
        )

        root.querySelector<HTMLButtonElement>('[aria-label="Back to search reports"]')?.click()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state.reviewReportId).toBeUndefined()
            expect(router.options.history.state.reviewPostId).toBeUndefined()
        })
    })

    it('restores the selected report and post from hidden history state', async () => {
        const { root, router } = await mountReview('/', {
            reviewReportId: secondReport.id,
            reviewPostId: secondPost.id,
        })

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(root.querySelector('.post-viewer')?.textContent).toContain(secondPost.techStack)
            expect(findButton(root, secondReport.summary).getAttribute('aria-pressed')).toBe('true')
        })
    })

    it('migrates legacy visible ids into hidden history state', async () => {
        const { root, router } = await mountReview(
            `/?reportId=${secondReport.id}&postId=${secondPost.id}`,
        )

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
                reviewPostId: secondPost.id,
            })
            expect(root.querySelector('.post-viewer')?.textContent).toContain(secondPost.techStack)
        })
    })

    it('restores hidden selection state through browser back and forward navigation', async () => {
        const { root, router } = await mountReview()

        findButton(root, secondReport.summary).click()
        await vi.waitFor(() => expect(root.textContent).toContain(secondPost.roleTitle))
        findButton(root, secondPost.roleTitle).click()
        await vi.waitFor(() =>
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
                reviewPostId: secondPost.id,
            }),
        )

        router.back()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            })
            expect(router.options.history.state.reviewPostId).toBeUndefined()
            expect(root.querySelector('.post-viewer')).toBeNull()
        })

        router.back()

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state.reviewReportId).toBeUndefined()
            expect(root.querySelector('[aria-label="Back to search reports"]')).toBeNull()
        })

        router.forward()
        await vi.waitFor(() =>
            expect(root.querySelector('[aria-label="Back to search reports"]')).not.toBeNull(),
        )

        router.forward()
        await vi.waitFor(() => {
            expect(root.querySelector('.post-viewer')?.textContent).toContain(secondPost.techStack)
        })
    })

    it('removes stale legacy ids from the visible URL', async () => {
        const { root, router } = await mountReview('/?reportId=missing&postId=missing')

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state.reviewReportId).toBeUndefined()
            expect(router.options.history.state.reviewPostId).toBeUndefined()
            expect(findButton(root, firstReport.summary).getAttribute('aria-pressed')).toBe('true')
            expect(root.querySelector('.post-viewer')).toBeNull()
        })
    })

    it('keeps valid hidden report state when removing a stale post id', async () => {
        const { root, router } = await mountReview(`/?reportId=${secondReport.id}&postId=missing`)

        await vi.waitFor(() => {
            expect(router.currentRoute.value.fullPath).toBe('/')
            expect(router.options.history.state).toMatchObject({
                reviewReportId: secondReport.id,
            })
            expect(router.options.history.state.reviewPostId).toBeUndefined()
            expect(findButton(root, secondReport.summary).getAttribute('aria-pressed')).toBe('true')
            expect(root.querySelector('.post-viewer')).toBeNull()
        })
    })
})
