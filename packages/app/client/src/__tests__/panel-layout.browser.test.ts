import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import ApplyView from '@/views/ApplyView.vue'
import ReviewView from '@/views/ReviewView.vue'
import { makeJobPost, makeApplyQueueItem } from '@/test/fixtures/job-post'
import { makeJobSearchReport } from '@/test/fixtures/report'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { AgentBridgeHarness } from '@/test/support/agent-bridge-harness'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse, requestParts } from '@/test/support/http'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

const reviewPost = makeJobPost({ id: '10000000-0000-4000-8000-000000000011' })
const reviewReport = makeJobSearchReport({ id: '20000000-0000-4000-8000-000000000011' }, reviewPost)
const applyPost = makeJobPost({
    id: '10000000-0000-4000-8000-000000000021',
    userLabel: 'P1',
})
const applyQueueItem = makeApplyQueueItem(applyPost)
const outreachContact = makeOutreachContact({ jobPostId: applyPost.id })

function reviewApiResponse(input: RequestInfo | URL, init?: RequestInit) {
    const { method, url } = requestParts(input, init)

    if (method === 'GET' && url.endsWith('/job-search-reports')) {
        return Promise.resolve(jsonResponse([reviewReport]))
    }

    if (method === 'GET' && url.endsWith('/job-posts/user-added')) {
        return Promise.resolve(jsonResponse([]))
    }

    throw new Error(`Unexpected ${method} request: ${url}`)
}

function installReviewApi() {
    vi.stubGlobal('fetch', vi.fn(reviewApiResponse))
}

function applyApiResponse(
    input: RequestInfo | URL,
    init?: RequestInit,
    contacts = [outreachContact],
) {
    const { method, url } = requestParts(input, init)

    if (method === 'GET' && url.endsWith('/job-posts/apply-queue')) {
        return Promise.resolve(jsonResponse([applyQueueItem]))
    }

    if (method === 'GET' && url.endsWith(`/job-posts/${applyPost.id}/outreach-contacts`)) {
        return Promise.resolve(jsonResponse(contacts))
    }

    throw new Error(`Unexpected ${method} request: ${url}`)
}

function installApplyApi() {
    vi.stubGlobal('fetch', vi.fn(applyApiResponse))
}

async function mountReview() {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/', component: ReviewView }],
    })
    await router.push('/')
    await router.isReady()

    mountVue(ReviewView, {
        install: (app) => {
            app.use(createPinia())
            app.use(router)
        },
    })

    await expect.element(page.getByTestId(`report-card-${reviewReport.id}`)).toBeVisible()
}

async function mountApply() {
    mountVue(ApplyView, {
        install: (app) => app.use(createPinia()),
    })

    await expect.element(page.getByTestId(`job-post-card-${applyPost.id}`)).toBeVisible()
}

async function expectVisible(locator: ReturnType<typeof page.getByTestId>, visible: boolean) {
    if (visible) {
        await expect.element(locator).toBeVisible()
    } else {
        await expect.element(locator).not.toBeVisible()
    }
}

afterEach(async () => {
    await page.viewport(1024, 768)
})

describe.each([
    { width: 847, desktop: false },
    { width: 848, desktop: true },
])('panel layout at $width pixels', ({ width, desktop }) => {
    it('keeps Review panel visibility and back transitions consistent', async () => {
        await page.viewport(width, 768)
        installReviewApi()
        await mountReview()

        const sources = page.getByTestId('review-sources-panel')
        const posts = page.getByTestId('review-posts-panel')
        const importPanel = page.getByTestId('review-import-panel')

        await expect.element(sources).toBeVisible()
        await expectVisible(posts, desktop)
        await expect.element(importPanel).not.toBeVisible()
        await expect.element(page.getByTestId('review-viewer-panel')).not.toBeInTheDocument()

        await page.getByTestId(`report-card-${reviewReport.id}`).click()

        await expect.element(posts).toBeVisible()
        await expectVisible(sources, desktop)

        await page.getByTestId(`job-post-card-${reviewPost.id}`).click()

        const viewer = page.getByTestId('review-viewer-panel')
        const viewerBack = page.getByTestId('back-to-job-posts')
        await expect.element(viewer).toBeVisible()
        await expectVisible(posts, desktop)
        await expect.element(sources).not.toBeVisible()
        await expect.element(importPanel).not.toBeVisible()
        await expect.element(viewerBack).toBeVisible()

        await viewerBack.click()

        await expect.element(posts).toBeVisible()
        await expectVisible(viewer, desktop)
        await expect.element(sources).not.toBeVisible()

        await page.getByTestId('back-to-reports').click()

        await expect.element(sources).toBeVisible()
        await expectVisible(posts, desktop)
        await expect.element(viewer).not.toBeInTheDocument()
    })

    it('keeps Apply panel visibility and back transitions consistent', async () => {
        await page.viewport(width, 768)
        installApplyApi()
        await mountApply()

        const posts = page.getByTestId('apply-posts-panel')
        const viewer = page.getByTestId('apply-viewer-panel')

        await expect.element(posts).toBeVisible()
        await expectVisible(viewer, desktop)
        await expect.element(page.getByTestId('apply-outreach-panel')).not.toBeInTheDocument()

        await page.getByTestId(`job-post-card-${applyPost.id}`).click()

        const viewerBack = page.getByTestId('back-to-job-posts')
        await expect.element(viewer).toBeVisible()
        await expectVisible(posts, desktop)
        await expect.element(viewerBack).toBeVisible()

        await page.getByTestId('discover-contacts').click()

        const outreach = page.getByTestId('apply-outreach-panel')
        await expect.element(outreach).toBeVisible()
        await expect.element(posts).not.toBeVisible()
        await expectVisible(viewer, desktop)

        if (desktop) {
            await expect.element(viewerBack).toBeVisible()
            await viewerBack.click()

            await expect.element(posts).toBeVisible()
            await expect.element(viewer).toBeVisible()
            await expect.element(outreach).not.toBeVisible()
        } else {
            await page.getByTestId('back-to-job-post').click()

            await expect.element(posts).not.toBeVisible()
            await expect.element(viewer).toBeVisible()
            await expect.element(outreach).not.toBeVisible()

            await viewerBack.click()

            await expect.element(posts).toBeVisible()
            await expect.element(viewer).not.toBeVisible()
            await expect.element(outreach).not.toBeVisible()
        }
    })
})

describe('running Agent task panel layout', () => {
    it('keeps an import navigable while the mounted Review layout crosses the panel breakpoint', async () => {
        await page.viewport(390, 768)
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const agentBridge = new AgentBridgeHarness({ fallback: reviewApiResponse })
        vi.stubGlobal('fetch', agentBridge.fetch)
        await mountReview()

        await page.getByTestId('add-job-post').click()
        await page.getByTestId('job-post-url').fill('https://example.com/jobs/frontend-engineer')
        await page.getByTestId('start-job-post-import').click()

        const importPanel = page.getByTestId('review-import-panel')
        const importBack = page.getByTestId('back-from-job-post-import')
        const importCancel = page.getByTestId('cancel-job-post-import')
        const sources = page.getByTestId('review-sources-panel')
        const posts = page.getByTestId('review-posts-panel')

        await expect.element(importPanel).toBeVisible()
        await expect.element(importBack).toBeVisible()
        await expect.element(importCancel).toBeVisible()
        await expect.element(sources).not.toBeVisible()
        await expect.element(posts).not.toBeVisible()

        await page.viewport(847, 768)

        await expect.element(importPanel).toBeVisible()
        await expect.element(importBack).toBeVisible()
        await expect.element(importCancel).toBeVisible()
        await expect.element(sources).not.toBeVisible()
        await expect.element(posts).not.toBeVisible()

        await page.viewport(848, 768)

        await expect.element(importPanel).toBeVisible()
        await expect.element(importBack).toBeVisible()
        await expect.element(importCancel).toBeVisible()
        await expect.element(sources).toBeVisible()
        await expect.element(posts).not.toBeVisible()

        const sourcesRect = sources.element().getBoundingClientRect()
        const importRect = importPanel.element().getBoundingClientRect()

        expect(sourcesRect.left).toBeGreaterThanOrEqual(0)
        expect(sourcesRect.right).toBeLessThanOrEqual(importRect.left)
        expect(importRect.right).toBeLessThanOrEqual(848)

        await importBack.click()

        await expect.element(posts).toBeVisible()
        await expect.element(importPanel).not.toBeVisible()
        await expect.element(page.getByTestId('job-post-import-progress')).toBeVisible()

        await page.getByTestId('job-post-import-progress').click()

        await expect.element(importPanel).toBeVisible()
        await expect.element(importBack).toBeVisible()
        await expect.element(importCancel).toBeVisible()
        await expect.element(sources).toBeVisible()

        await page.viewport(847, 768)

        await expect.element(importPanel).toBeVisible()
        await expect.element(importBack).toBeVisible()
        await expect.element(importCancel).toBeVisible()
        await expect.element(sources).not.toBeVisible()
        await expect.element(posts).not.toBeVisible()
    })

    it('keeps outreach running while Apply navigates through neighboring panels', async () => {
        await page.viewport(848, 768)
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const agentBridge = new AgentBridgeHarness({
            fallback: (input, init) => applyApiResponse(input, init, []),
        })
        vi.stubGlobal('fetch', agentBridge.fetch)
        await mountApply()

        const posts = page.getByTestId('apply-posts-panel')
        const viewer = page.getByTestId('apply-viewer-panel')

        await page.getByTestId(`job-post-card-${applyPost.id}`).click()
        await page.getByTestId('discover-contacts').click()

        const outreach = page.getByTestId('apply-outreach-panel')
        const outreachBack = page.getByTestId('back-to-saved-contacts')
        const outreachCancel = page.getByTestId('outreach-cancel')

        await expect.element(outreach).toBeVisible()
        await expect.element(outreachBack).toBeVisible()
        await expect.element(outreachCancel).toBeVisible()
        await expect.element(viewer).toBeVisible()
        await expect.element(posts).not.toBeVisible()

        const viewerRect = viewer.element().getBoundingClientRect()
        const outreachRect = outreach.element().getBoundingClientRect()

        expect(viewerRect.left).toBeGreaterThanOrEqual(0)
        expect(viewerRect.right).toBeLessThanOrEqual(outreachRect.left)
        expect(outreachRect.right).toBeLessThanOrEqual(848)

        await page.getByTestId('back-to-job-posts').click()

        await expect.element(posts).toBeVisible()
        await expect.element(viewer).toBeVisible()
        await expect.element(outreach).not.toBeVisible()

        await page.getByTestId(`job-post-card-${applyPost.id}`).click()
        await page.getByTestId('discover-contacts').click()

        await expect.element(outreach).toBeVisible()
        await expect.element(outreachBack).toBeVisible()
        await expect.element(outreachCancel).toBeVisible()

        await outreachBack.click()

        await expect.element(page.getByTestId('outreach-contact-list')).toBeVisible()
        await expect.element(page.getByTestId('outreach-contact-progress')).toBeVisible()
        await expect.element(viewer).toBeVisible()
        await expect.element(posts).not.toBeVisible()

        await page.getByTestId('outreach-contact-progress').click()

        await expect.element(outreachBack).toBeVisible()
        await expect.element(outreachCancel).toBeVisible()
        await expect.element(viewer).toBeVisible()
    })
})
