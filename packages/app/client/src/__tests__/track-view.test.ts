/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import TrackView from '@/views/TrackView.vue'
import { makeJobPost } from '@/test/fixtures/job-post'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { makeTrackedJobPost } from '@/test/fixtures/tracked-job-post'
import { AgentBridgeHarness } from '@/test/support/agent-bridge-harness'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse, requestParts } from '@/test/support/http'
import { mountVue } from '@/test/support/mount'
import { useAgentStore } from '@/stores/agent'

describe('track view', () => {
    it('updates stacked application and outreach labels', async () => {
        let tracked = makeTrackedJobPost()
        const contact = tracked.contacts[0]!
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = requestParts(input, init)

                if (request.method === 'PATCH' && request.url.includes('/outreach-contacts/')) {
                    const updatedContact = {
                        ...contact,
                        respondedAt: '2026-08-18T12:00:00.000Z',
                        updatedAt: '2026-08-18T12:00:00.000Z',
                    }
                    tracked = { ...tracked, contacts: [updatedContact] }
                    return jsonResponse(updatedContact)
                }

                if (request.method === 'PATCH') {
                    const updatedPost = {
                        ...tracked.post,
                        applicationStatus: 'interviewing' as const,
                        updatedAt: '2026-08-18T12:01:00.000Z',
                    }
                    tracked = { ...tracked, post: updatedPost }
                    return jsonResponse({ post: updatedPost, inApplyQueue: false })
                }

                return jsonResponse([tracked])
            }),
        )
        const { root } = mountVue(TrackView, {
            install: (app) => app.use(createPinia()),
        })
        const card = () => root.querySelector(`[data-testid="job-post-card-${tracked.post.id}"]`)

        await vi.waitFor(() => expect(card()).not.toBeNull())
        expect(card()?.querySelector('[data-testid="job-post-label"]')?.textContent).toContain(
            'Awaiting response',
        )
        expect(card()?.querySelector('[data-testid="job-post-label"]')?.classList).toContain(
            'user-label-muted',
        )
        expect(card()?.querySelector('[data-testid="outreach-response-label"]')).toBeNull()

        root.querySelector<HTMLButtonElement>(
            `[data-testid="track-contact-response-toggle-${contact.id}"]`,
        )!.click()
        await vi.waitFor(() =>
            expect(
                card()?.querySelector('[data-testid="outreach-response-label"]')?.textContent,
            ).toContain('Outreach response'),
        )

        root.querySelector<HTMLButtonElement>(
            '[data-testid="track-application-status-trigger"]',
        )!.click()
        await vi.waitFor(() =>
            expect(
                root.querySelector('[data-testid="track-application-status-option-interviewing"]'),
            ).not.toBeNull(),
        )
        root.querySelector<HTMLButtonElement>(
            '[data-testid="track-application-status-option-interviewing"]',
        )!.click()

        await vi.waitFor(() =>
            expect(card()?.querySelector('[data-testid="job-post-label"]')?.textContent).toContain(
                'Interviewing',
            ),
        )
        expect(card()?.querySelector('[data-testid="outreach-response-label"]')).not.toBeNull()
    })

    it('restores the selected job and summarizes tracked work', async () => {
        const first = makeTrackedJobPost({
            post: makeJobPost({
                id: '30000000-0000-4000-8000-000000000001',
                company: 'Acme',
                roleTitle: 'Frontend Engineer',
                applicationStatus: 'interviewing',
                appliedAt: '2026-07-20T12:00:00.000Z',
            }),
            jobPostSnapshot: {
                description: 'Complete job description',
                sourceUrl: 'https://example.com/jobs/acme',
                capturedAt: '2026-07-20T12:00:00.000Z',
            },
            applicationArtifacts: [
                {
                    kind: 'resume',
                    fileName: 'frontend-resume.pdf',
                    mediaType: 'application/pdf',
                    sizeBytes: 1_024,
                    uploadedAt: '2026-07-20T12:00:00.000Z',
                },
                {
                    kind: 'application-page',
                    fileName: 'application.webarchive',
                    mediaType: 'application/x-webarchive',
                    sizeBytes: 2_048,
                    uploadedAt: '2026-07-20T12:00:00.000Z',
                },
            ],
        })
        const second = makeTrackedJobPost({
            post: makeJobPost({
                id: '30000000-0000-4000-8000-000000000002',
                company: 'Globex',
                applicationStatus: 'rejected',
                appliedAt: '2026-07-18T12:00:00.000Z',
            }),
            contacts: [],
        })
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => jsonResponse([first, second])),
        )
        const firstMount = mountVue(TrackView, {
            install: (app) => app.use(createPinia()),
        })

        await vi.waitFor(() =>
            expect(
                firstMount.root.querySelector('[data-testid="tracked-job-detail"]'),
            ).not.toBeNull(),
        )

        expect(
            firstMount.root
                .querySelector('[data-testid="tracked-job-detail"]')
                ?.getAttribute('data-post-id'),
        ).toBe(first.post.id)
        expect(firstMount.root.querySelector('[data-testid="view-resume-artifact"]')).not.toBeNull()
        expect(
            firstMount.root.querySelector('[data-testid="view-application-page-artifact"]'),
        ).not.toBeNull()
        const postLink = firstMount.root.querySelector<HTMLAnchorElement>(
            '[data-testid="tracked-job-post-link"]',
        )
        expect(postLink?.href).toBe(first.post.postUrl)
        expect(postLink?.target).toBe('_blank')
        expect(postLink?.rel).toBe('noopener noreferrer')
        firstMount.root
            .querySelector<HTMLButtonElement>('[data-testid="view-job-description"]')!
            .click()
        await vi.waitFor(() =>
            expect(
                firstMount.root.querySelector('[data-testid="job-description-text"]')?.textContent,
            ).toContain('Complete job description'),
        )
        expect(
            firstMount.root
                .querySelector('[data-testid="tracked-job-detail"]')
                ?.closest('[data-active]')
                ?.getAttribute('data-active'),
        ).toBe('false')
        firstMount.root
            .querySelector<HTMLButtonElement>('[data-testid="back-from-job-description"]')!
            .click()
        expect(sessionStorage.getItem('job-search-facilitator:track-selected-post')).toBe(
            first.post.id,
        )
        firstMount.unmount()

        const { root } = mountVue(TrackView, {
            install: (app) => app.use(createPinia()),
        })
        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="tracked-job-detail"]')
                    ?.getAttribute('data-post-id'),
            ).toBe(first.post.id),
        )
        expect(
            root
                .querySelector('[data-testid="active-application-count"]')
                ?.getAttribute('data-count'),
        ).toBe('1')
        expect(
            root
                .querySelector('[data-testid="closed-application-count"]')
                ?.getAttribute('data-count'),
        ).toBe('1')
    })

    it('filters cards with track stats and excludes closed outreach from counts', async () => {
        const active = makeTrackedJobPost({
            post: makeJobPost({
                id: '30000000-0000-4000-8000-000000000001',
                applicationStatus: 'interviewing',
            }),
            contacts: [
                makeOutreachContact({
                    id: '50000000-0000-4000-8000-000000000001',
                    jobPostId: '30000000-0000-4000-8000-000000000001',
                    messaged: true,
                    messagedAt: '2026-07-20T12:00:00.000Z',
                }),
                makeOutreachContact({
                    id: '50000000-0000-4000-8000-000000000002',
                    jobPostId: '30000000-0000-4000-8000-000000000001',
                    messaged: true,
                    messagedAt: '2026-07-20T12:00:00.000Z',
                    respondedAt: '2026-07-21T12:00:00.000Z',
                }),
                makeOutreachContact({
                    id: '50000000-0000-4000-8000-000000000005',
                    jobPostId: '30000000-0000-4000-8000-000000000001',
                }),
            ],
        })
        const closed = makeTrackedJobPost({
            post: makeJobPost({
                id: '30000000-0000-4000-8000-000000000002',
                applicationStatus: 'rejected',
            }),
            contacts: [
                makeOutreachContact({
                    id: '50000000-0000-4000-8000-000000000003',
                    jobPostId: '30000000-0000-4000-8000-000000000002',
                }),
                makeOutreachContact({
                    id: '50000000-0000-4000-8000-000000000004',
                    jobPostId: '30000000-0000-4000-8000-000000000002',
                    respondedAt: '2026-07-21T12:00:00.000Z',
                }),
            ],
        })
        const contacted = makeTrackedJobPost({
            post: makeJobPost({
                id: '30000000-0000-4000-8000-000000000003',
                applicationStatus: 'not-applied',
            }),
            contacts: [],
        })
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => jsonResponse([active, closed, contacted])),
        )
        const { root } = mountVue(TrackView, {
            install: (app) => app.use(createPinia()),
        })
        const card = (postId: string) =>
            root.querySelector(`[data-testid="job-post-card-${postId}"]`)
        const clickStat = (testId: string) =>
            root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click()

        await vi.waitFor(() => expect(card(active.post.id)).not.toBeNull())

        expect(card(closed.post.id)).toBeNull()
        expect(card(contacted.post.id)).not.toBeNull()
        expect(card(active.post.id)?.textContent).toContain('Interviewing')
        expect(
            root
                .querySelector('[data-testid="pending-outreach-count"]')
                ?.getAttribute('data-count'),
        ).toBe('1')
        expect(
            root
                .querySelector('[data-testid="outreach-response-count"]')
                ?.getAttribute('data-count'),
        ).toBe('1')

        clickStat('active-application-count')
        await vi.waitFor(() => expect(card(contacted.post.id)).toBeNull())
        expect(
            root
                .querySelector('[data-testid="active-application-count"]')
                ?.getAttribute('aria-pressed'),
        ).toBe('true')

        clickStat('closed-application-count')
        await vi.waitFor(() => expect(card(closed.post.id)).not.toBeNull())
        expect(card(active.post.id)).toBeNull()
        expect(card(closed.post.id)?.classList).toContain('post-card-closed')
        expect(card(closed.post.id)?.textContent).toContain('Closed')

        clickStat('pending-outreach-count')
        await vi.waitFor(() => expect(card(active.post.id)).not.toBeNull())
        expect(card(closed.post.id)).toBeNull()

        clickStat('outreach-response-count')
        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="outreach-response-count"]')
                    ?.getAttribute('aria-pressed'),
            ).toBe('true'),
        )
        expect(card(active.post.id)).not.toBeNull()
        expect(card(closed.post.id)).toBeNull()
    })

    it('opens saved outreach drafts beside the tracked application', async () => {
        const tracked = makeTrackedJobPost()
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => jsonResponse([tracked])),
        )
        const { root } = mountVue(TrackView, {
            install: (app) => app.use(createPinia()),
        })
        const contact = tracked.contacts[0]!

        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-contact-${contact.id}-select"]`),
            ).not.toBeNull(),
        )

        expect(root.querySelector('[data-testid="track-discover-contact"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="contact-filter"]')).toBeNull()
        expect(
            root.querySelector(`[data-testid="track-contact-response-toggle-${contact.id}"]`),
        ).not.toBeNull()
        expect(root.querySelectorAll('[data-testid="outreach-contact-list"]')).toHaveLength(1)
        root.querySelector<HTMLButtonElement>(
            `[data-testid="outreach-contact-${contact.id}-select"]`,
        )!.click()

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-draft"]')).not.toBeNull(),
        )
        expect(root.querySelectorAll('[data-testid="outreach-contact-list"]')).toHaveLength(1)
        expect(
            root.querySelector('[data-testid="track-outreach-panel"]')?.getAttribute('data-active'),
        ).toBe('true')

        root.querySelector<HTMLButtonElement>('[data-testid="back-to-track-outreach"]')!.click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="outreach-draft"]')).toBeNull(),
        )
    })

    it('removes a selected discovered contact and returns to tracking', async () => {
        const tracked = makeTrackedJobPost()
        let contacts = [...tracked.contacts]
        const requests: ReturnType<typeof requestParts>[] = []
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = requestParts(input, init)
                requests.push(request)

                if (request.method === 'DELETE') {
                    contacts = []
                    return new Response(null, { status: 204 })
                }

                return jsonResponse([{ ...tracked, contacts }])
            }),
        )
        const { root } = mountVue(TrackView, {
            install: (app) => app.use(createPinia()),
        })
        const contact = tracked.contacts[0]!

        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-contact-${contact.id}-select"]`),
            ).not.toBeNull(),
        )
        root.querySelector<HTMLButtonElement>(
            `[data-testid="outreach-contact-${contact.id}-select"]`,
        )!.click()
        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="remove-outreach-contact"]')).not.toBeNull(),
        )
        root.querySelector<HTMLButtonElement>('[data-testid="remove-outreach-contact"]')!.click()

        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-contact-${contact.id}-select"]`),
            ).toBeNull(),
        )
        expect(root.querySelector('[data-testid="outreach-draft"]')).toBeNull()
        expect(requests.filter(({ method }) => method === 'DELETE')).toHaveLength(1)
    })

    it('offers response tracking only after outreach is marked as messaged', async () => {
        const tracked = makeTrackedJobPost()
        const unmessagedContact = makeOutreachContact({
            id: '50000000-0000-4000-8000-000000000002',
            jobPostId: tracked.post.id,
        })
        tracked.contacts.push(unmessagedContact)
        const updatedContact = {
            ...unmessagedContact,
            messaged: true,
            messagedAt: '2026-08-06T21:42:00.000Z',
            updatedAt: '2026-08-06T21:42:00.000Z',
        }
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = requestParts(input, init)

                return request.method === 'PATCH'
                    ? jsonResponse(updatedContact)
                    : jsonResponse([tracked])
            }),
        )
        const { root } = mountVue(TrackView, {
            install: (app) => app.use(createPinia()),
        })

        await vi.waitFor(() =>
            expect(
                root.querySelector(
                    `[data-testid="outreach-contact-${unmessagedContact.id}-select"]`,
                ),
            ).not.toBeNull(),
        )
        expect(
            root.querySelector(
                `[data-testid="track-contact-response-toggle-${unmessagedContact.id}"]`,
            ),
        ).toBeNull()

        root.querySelector<HTMLButtonElement>(
            `[data-testid="outreach-contact-${unmessagedContact.id}-select"]`,
        )!.click()
        await vi.waitFor(() =>
            expect(
                root
                    .querySelector('[data-testid="outreach-contact-messaged-toggle"]')
                    ?.getAttribute('aria-pressed'),
            ).toBe('false'),
        )
        root.querySelector<HTMLButtonElement>(
            '[data-testid="outreach-contact-messaged-toggle"]',
        )!.click()

        await vi.waitFor(() =>
            expect(
                root.querySelector(
                    `[data-testid="track-contact-recently-messaged-${unmessagedContact.id}"]`,
                ),
            ).not.toBeNull(),
        )
        expect(
            root.querySelector(
                `[data-testid="track-contact-response-toggle-${unmessagedContact.id}"]`,
            ),
        ).toBeNull()

        root.querySelector<HTMLButtonElement>('[data-testid="back-to-track-outreach"]')!.click()
        await vi.waitFor(() =>
            expect(
                root.querySelector(
                    `[data-testid="track-contact-response-toggle-${unmessagedContact.id}"]`,
                ),
            ).not.toBeNull(),
        )
    })

    it('shows active contact discovery in the tracked outreach section', async () => {
        const tracked = makeTrackedJobPost({ contacts: [] })
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const bridge = new AgentBridgeHarness({
            fallback: async () => jsonResponse([tracked]),
        })
        vi.stubGlobal('fetch', bridge.fetch)
        const pinia = createPinia()
        const { root } = mountVue(TrackView, {
            install: (app) => app.use(pinia),
        })

        await vi.waitFor(() =>
            expect(root.querySelector('[data-testid="track-discover-contact"]')).not.toBeNull(),
        )
        root.querySelector<HTMLButtonElement>('[data-testid="track-discover-contact"]')!.click()

        await vi.waitFor(() => expect(bridge.tasks.size).toBe(1))
        const taskId = [...bridge.tasks.keys()][0]!
        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-task-${taskId}"]`)?.textContent,
            ).toContain('Discovering contact'),
        )

        const agentStore = useAgentStore(pinia)
        const taskState = agentStore.getTaskState(taskId)!
        agentStore.taskStates = {
            ...agentStore.taskStates,
            [taskId]: {
                ...taskState,
                pendingPermission: {
                    id: 'permission-1',
                    kind: 'browser-origin',
                    message: 'Allow Chrome to access LinkedIn?',
                    origin: 'https://www.linkedin.com',
                },
            },
        }

        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="outreach-task-${taskId}-permission-needed"]`),
            ).not.toBeNull(),
        )
        expect(root.querySelectorAll('[data-testid="outreach-contact-list"]')).toHaveLength(1)
        expect(
            root.querySelector('[data-testid="track-outreach-panel"]')?.getAttribute('data-active'),
        ).toBe('true')
    })
})
