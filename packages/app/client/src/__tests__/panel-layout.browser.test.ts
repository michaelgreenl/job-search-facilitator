import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import ApplyView from '@/views/ApplyView.vue'
import ReviewView from '@/views/ReviewView.vue'
import TrackView from '@/views/TrackView.vue'
import { makeJobPost, makeApplyQueueItem } from '@/test/fixtures/job-post'
import { makeJobSearchReport } from '@/test/fixtures/report'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { makeTrackedJobPost } from '@/test/fixtures/tracked-job-post'
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
const applySecondPost = makeJobPost({
    id: '10000000-0000-4000-8000-000000000022',
    userLabel: 'P2',
})
const resumeArtifact = {
    kind: 'resume',
    fileName: 'resume.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 1_024,
    uploadedAt: '2026-08-05T20:00:00.000Z',
} as const
const applyQueueItems = [
    makeApplyQueueItem(applyPost, undefined, [resumeArtifact]),
    makeApplyQueueItem(applySecondPost),
]
const outreachContact = makeOutreachContact({ jobPostId: applyPost.id })
const secondOutreachContact = makeOutreachContact({
    id: '50000000-0000-4000-8000-000000000002',
    jobPostId: applySecondPost.id,
    personName: 'Grace Hopper',
})
const trackedPost = makeTrackedJobPost({
    post: makeJobPost({
        id: '10000000-0000-4000-8000-000000000031',
        company: 'Tracked Company',
        roleTitle: 'Tracked Engineer',
    }),
    jobPostSnapshot: {
        description: 'Exact tracked job description',
        sourceUrl: 'https://example.com/jobs/tracked',
        capturedAt: '2026-08-05T20:00:00.000Z',
    },
    applicationArtifacts: [resumeArtifact],
})

const contactDiscoveryOutput = (contact: ReturnType<typeof makeOutreachContact>) => ({
    outcome: 'contact',
    contact: {
        personName: contact.personName,
        personTitle: contact.personTitle,
        profileUrl: contact.profileUrl,
        relevanceRationale: contact.relevanceRationale,
        draftMessage: contact.draftMessage,
    },
    error: null,
})

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
        return Promise.resolve(jsonResponse(applyQueueItems))
    }

    if (
        method === 'GET' &&
        [applyPost.id, applySecondPost.id].some((postId) =>
            url.endsWith(`/job-posts/${postId}/outreach-contacts`),
        )
    ) {
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

async function mountTrack() {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse([trackedPost])),
    )
    mountVue(TrackView, {
        install: (app) => app.use(createPinia()),
    })

    await expect.element(page.getByTestId(`job-post-card-${trackedPost.post.id}`)).toBeVisible()
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

describe('application artifact controls', () => {
    it('matches the Outreach action size and reveals removal on hover', async () => {
        await page.viewport(1024, 768)
        installApplyApi()
        await mountApply()

        const artifact = page.getByTestId('remove-resume-artifact')
        const uploadInput = page.getByTestId('cover-letter-artifact-input')
        const outreach = page.getByTestId('discover-contacts')
        const upload = uploadInput.element().closest('label')

        if (upload === null) {
            throw new Error('Cover-letter upload control is missing its label')
        }

        expect(upload.getBoundingClientRect().height).toBe(
            outreach.element().getBoundingClientRect().height,
        )
        await expect.element(page.getByTestId('resume-artifact-check-icon')).toBeVisible()
        await expect.element(page.getByTestId('resume-artifact-remove-icon')).not.toBeVisible()

        await artifact.hover()

        await expect.element(page.getByTestId('resume-artifact-check-icon')).not.toBeVisible()
        await expect.element(page.getByTestId('resume-artifact-remove-icon')).toBeVisible()
    })
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
        await expectVisible(viewerBack, !desktop)

        if (!desktop) {
            await viewerBack.click()

            await expect.element(posts).toBeVisible()
            await expect.element(viewer).not.toBeVisible()
            await expect.element(sources).not.toBeVisible()
        }

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
        await expect.element(page.getByTestId('back-to-job-posts')).not.toBeInTheDocument()

        await page.getByTestId(`job-post-card-${applySecondPost.id}`).click()

        const viewerBack = page.getByTestId('back-to-job-posts')
        await expect.element(viewer).toBeVisible()
        await expectVisible(posts, desktop)
        await expectVisible(viewerBack, !desktop)

        if (!desktop) {
            await viewerBack.click()
            await expect.element(posts).toBeVisible()
        }

        await page.getByTestId(`job-post-card-${applyPost.id}`).click()
        await expect.element(viewer).toBeVisible()
        await expectVisible(viewerBack, !desktop)

        await page.getByTestId('discover-contacts').click()

        const outreach = page.getByTestId('apply-outreach-panel')
        const contactBack = page.getByTestId('back-to-job-post')
        await expect.element(outreach).toBeVisible()
        await expect.element(posts).not.toBeVisible()
        await expectVisible(viewer, desktop)
        await expectVisible(viewerBack, desktop)
        await expectVisible(contactBack, !desktop)

        if (desktop) {
            await viewerBack.click()

            await expect.element(posts).toBeVisible()
            await expect.element(viewer).toBeVisible()
            await expect.element(outreach).not.toBeVisible()
            await expect.element(viewerBack).not.toBeInTheDocument()
        } else {
            await contactBack.click()

            await expect.element(posts).not.toBeVisible()
            await expect.element(viewer).toBeVisible()
            await expect.element(outreach).not.toBeVisible()

            await viewerBack.click()

            await expect.element(posts).toBeVisible()
            await expect.element(viewer).not.toBeVisible()
            await expect.element(outreach).not.toBeVisible()
        }
    })

    it('opens the job description beside the tracked application on desktop', async () => {
        await page.viewport(width, 768)
        await mountTrack()
        await expect.element(page.getByTestId('back-to-tracked-jobs')).not.toBeInTheDocument()

        await page.getByTestId(`job-post-card-${trackedPost.post.id}`).click()

        const detail = page.getByTestId('tracked-job-detail')
        const detailBack = page.getByTestId('back-to-tracked-jobs')
        await expect.element(detail).toBeVisible()
        await expectVisible(detailBack, !desktop)
        await expect.element(page.getByTestId('view-resume-artifact')).toBeVisible()

        await page.getByTestId('view-job-description').click()

        const description = page.getByTestId('job-description-text')
        const descriptionBack = page.getByTestId('back-from-job-description')
        await expect.element(description).toBeVisible()
        await expectVisible(detail, desktop)
        await expectVisible(detailBack, desktop)
        await expectVisible(descriptionBack, !desktop)

        if (desktop) {
            const detailRect = detail.element().closest('[data-active]')!.getBoundingClientRect()
            const descriptionRect = description
                .element()
                .closest('[data-active]')!
                .getBoundingClientRect()

            expect(detailRect.right).toBeLessThanOrEqual(descriptionRect.left)
        } else {
            await descriptionBack.click()
            await expect.element(detail).toBeVisible()
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
        await expect.element(sources).toBeVisible()
        await expect.element(importPanel).not.toBeVisible()
        await expect.element(page.getByTestId('job-post-import-progress')).toBeVisible()

        const returnedSourcesRect = sources.element().getBoundingClientRect()
        const postsRect = posts.element().getBoundingClientRect()

        expect(returnedSourcesRect.right).toBeLessThanOrEqual(postsRect.left)
        expect(postsRect.right).toBeLessThanOrEqual(848)

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
        await vi.waitFor(() => expect(agentBridge.tasks.size).toBe(1))
        const taskId = [...agentBridge.tasks.keys()][0]!

        const outreach = page.getByTestId('apply-outreach-panel')
        const outreachBack = page.getByTestId('back-to-saved-contacts')
        const outreachCancel = page.getByTestId('outreach-cancel')
        const viewerBack = page.getByTestId('back-to-job-posts')

        await expect.element(outreach).toBeVisible()
        await expect.element(outreachBack).toBeVisible()
        await expect.element(outreachCancel).toBeVisible()
        await expect.element(viewer).toBeVisible()
        await expect.element(posts).not.toBeVisible()
        await expect.element(viewerBack).toBeVisible()

        const viewerRect = viewer.element().getBoundingClientRect()
        const outreachRect = outreach.element().getBoundingClientRect()

        expect(viewerRect.left).toBeGreaterThanOrEqual(0)
        expect(viewerRect.right).toBeLessThanOrEqual(outreachRect.left)
        expect(outreachRect.right).toBeLessThanOrEqual(848)

        await outreachBack.click()

        await expect.element(page.getByTestId('outreach-contact-list')).toBeVisible()
        await expect.element(page.getByTestId(`outreach-task-${taskId}-select`)).toBeVisible()
        await expect.element(viewer).toBeVisible()
        await expect.element(posts).not.toBeVisible()
        await expect.element(page.getByTestId('back-to-job-post')).not.toBeVisible()
        await expect.element(viewerBack).toBeVisible()

        await viewerBack.click()

        await expect.element(posts).toBeVisible()
        await expect.element(viewer).toBeVisible()
        await expect.element(outreach).not.toBeVisible()
        await expect.element(viewerBack).not.toBeInTheDocument()

        await page.getByTestId(`job-post-card-${applyPost.id}`).click()
        await page.getByTestId('discover-contacts').click()

        await expect.element(outreachBack).toBeVisible()
        await expect.element(outreachCancel).toBeVisible()
        await expect.element(viewerBack).toBeVisible()
        await expect.element(viewer).toBeVisible()
    })

    it('starts and reopens multiple outreach tasks for the same post', async () => {
        await page.viewport(848, 768)
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const agentBridge = new AgentBridgeHarness({
            fallback: applyApiResponse,
        })
        vi.stubGlobal('fetch', agentBridge.fetch)
        await mountApply()

        await page.getByTestId(`job-post-card-${applyPost.id}`).click()
        await page.getByTestId('discover-contacts').click()
        const discoverAnother = page.getByTestId('discover-another-contact')
        await expect.element(discoverAnother).toBeEnabled()
        await discoverAnother.click()

        await vi.waitFor(() => expect(agentBridge.tasks.size).toBe(1))
        const firstTaskId = [...agentBridge.tasks.keys()][0]!
        await expect.element(page.getByTestId('outreach-cancel')).toBeVisible()

        await page.getByTestId('discover-contacts').click()

        const firstTaskRow = page.getByTestId(`outreach-task-${firstTaskId}-select`)
        await expect
            .element(page.getByTestId(`outreach-contact-${outreachContact.id}-select`))
            .toBeVisible()
        await expect.element(firstTaskRow).toBeVisible()
        await expect.element(discoverAnother).toBeEnabled()
        await discoverAnother.click()

        await expect.element(page.getByTestId('outreach-cancel')).toBeVisible()
        await vi.waitFor(() => expect(agentBridge.tasks.size).toBe(2))
        const secondTaskId = [...agentBridge.tasks.keys()].find((taskId) => taskId !== firstTaskId)!

        await page.getByTestId('discover-contacts').click()

        const secondTaskRow = page.getByTestId(`outreach-task-${secondTaskId}-select`)
        await expect.element(firstTaskRow).toBeVisible()
        await expect.element(secondTaskRow).toBeVisible()

        await firstTaskRow.click()
        await page.getByTestId('outreach-cancel').click()
        await vi.waitFor(() => expect(agentBridge.tasks.get(firstTaskId)?.status).toBe('cancelled'))
        expect(agentBridge.tasks.get(secondTaskId)?.status).toBe('running')

        await page.getByTestId('back-to-saved-contacts').click()
        await expect.element(firstTaskRow).not.toBeInTheDocument()
        await expect.element(secondTaskRow).toBeVisible()

        await secondTaskRow.click()
        await page.getByTestId('outreach-cancel').click()
        await vi.waitFor(() =>
            expect(agentBridge.tasks.get(secondTaskId)?.status).toBe('cancelled'),
        )
    })

    it('opens the contact list for two active tasks without saved contacts', async () => {
        await page.viewport(848, 768)
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const agentBridge = new AgentBridgeHarness({
            fallback: (input, init) => applyApiResponse(input, init, []),
        })
        vi.stubGlobal('fetch', agentBridge.fetch)
        await mountApply()

        await page.getByTestId(`job-post-card-${applyPost.id}`).click()
        await page.getByTestId('discover-contacts').click()
        await vi.waitFor(() => expect(agentBridge.tasks.size).toBe(1))
        const firstTaskId = [...agentBridge.tasks.keys()][0]!

        await page.getByTestId('back-to-saved-contacts').click()
        await page.getByTestId('discover-another-contact').click()
        await vi.waitFor(() => expect(agentBridge.tasks.size).toBe(2))
        const secondTaskId = [...agentBridge.tasks.keys()].find((taskId) => taskId !== firstTaskId)!

        await page.getByTestId('discover-contacts').click()

        await expect.element(page.getByTestId(`outreach-task-${firstTaskId}-select`)).toBeVisible()
        await expect.element(page.getByTestId(`outreach-task-${secondTaskId}-select`)).toBeVisible()
    })

    it('starts and completes outreach independently across different posts', async () => {
        await page.viewport(848, 768)
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const persistedPostIds: string[] = []
        let resolveFirstContactWrite: ((response: Response) => void) | undefined
        const firstContactWrite = new Promise<Response>((resolve) => {
            resolveFirstContactWrite = resolve
        })
        const agentBridge = new AgentBridgeHarness({
            fallback: (input, init) => {
                const { method, url } = requestParts(input, init)
                const postId = [applyPost.id, applySecondPost.id].find((id) =>
                    url.endsWith(`/job-posts/${id}/outreach-contacts`),
                )

                if (postId !== undefined && method === 'POST') {
                    if (postId === applyPost.id) {
                        return firstContactWrite.then((response) => {
                            persistedPostIds.push(postId)
                            return response
                        })
                    }

                    persistedPostIds.push(postId)
                    return jsonResponse(secondOutreachContact, 201)
                }

                return applyApiResponse(input, init, [])
            },
        })
        vi.stubGlobal('fetch', agentBridge.fetch)
        await mountApply()

        await page.getByTestId(`job-post-card-${applyPost.id}`).click()
        await page.getByTestId('discover-contacts').click()
        await vi.waitFor(() => expect(agentBridge.tasks.size).toBe(1))
        const firstTaskId = [...agentBridge.tasks.keys()][0]!

        await page.getByTestId('back-to-job-posts').click()
        await page.getByTestId(`job-post-card-${applySecondPost.id}`).click()
        await page.getByTestId('discover-contacts').click()
        await vi.waitFor(() => expect(agentBridge.tasks.size).toBe(2))
        const secondTaskId = [...agentBridge.tasks.keys()].find((taskId) => taskId !== firstTaskId)!
        await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(2))

        agentBridge.complete(firstTaskId, contactDiscoveryOutput(outreachContact))
        agentBridge.complete(secondTaskId, contactDiscoveryOutput(secondOutreachContact))

        await vi.waitFor(() => expect(persistedPostIds).toEqual([applySecondPost.id]))
        resolveFirstContactWrite?.(jsonResponse(outreachContact, 201))
        await vi.waitFor(() =>
            expect(persistedPostIds.sort()).toEqual([applyPost.id, applySecondPost.id].sort()),
        )
    })
})
