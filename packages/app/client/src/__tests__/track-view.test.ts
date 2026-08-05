/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import TrackView from '@/views/TrackView.vue'
import { makeJobPost } from '@/test/fixtures/job-post'
import { makeTrackedJobPost } from '@/test/fixtures/tracked-job-post'
import { useAgentStore } from '@/stores/agent'
import { AgentBridgeHarness } from '@/test/support/agent-bridge-harness'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse, requestUrl } from '@/test/support/http'
import { mountVue } from '@/test/support/mount'

describe('track view', () => {
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
            applicationSnapshot: {
                content: 'Name: Applicant',
                sourceUrl: 'https://apply.example.com/jobs/acme',
                capturedAt: '2026-07-20T12:00:00.000Z',
            },
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
        expect(
            firstMount.root.querySelector('[data-testid="view-application-snapshot"]'),
        ).not.toBeNull()
        expect(
            firstMount.root.querySelector('[data-testid="view-job-post-snapshot"]'),
        ).not.toBeNull()
        firstMount.root
            .querySelector<HTMLButtonElement>(`[data-testid="job-post-card-${second.post.id}"]`)!
            .click()
        await vi.waitFor(() =>
            expect(
                firstMount.root
                    .querySelector('[data-testid="tracked-job-detail"]')
                    ?.getAttribute('data-post-id'),
            ).toBe(second.post.id),
        )
        expect(sessionStorage.getItem('job-search-facilitator:track-selected-post')).toBe(
            second.post.id,
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
            ).toBe(second.post.id),
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

    it('submits one completed update check and refreshes tracked jobs', async () => {
        const taskId = 'f67f9fe5-e502-4d28-8c72-c044f1babbb3'
        const tracked = makeTrackedJobPost()
        const context = {
            posts: [
                {
                    id: tracked.post.id,
                    company: tracked.post.company,
                    roleTitle: tracked.post.roleTitle,
                    postUrl: tracked.post.postUrl,
                    application: {
                        status: 'awaiting-response',
                        url: tracked.post.applicationUrl,
                        appliedAt: tracked.post.appliedAt!,
                    },
                    contacts: [],
                },
            ],
        }
        const result = {
            warnings: [],
            updates: [
                {
                    kind: 'application-status',
                    jobPostId: tracked.post.id,
                    status: 'interviewing',
                    source: 'gmail',
                    externalId: 'gmail-message-1',
                    summary: 'Interview requested',
                    sourceUrl: null,
                    occurredAt: '2026-08-03T12:00:00.000Z',
                },
            ],
        }
        let trackedReads = 0
        let savedResult: unknown
        const harness = new AgentBridgeHarness({
            fallback: (input, init) => {
                const url = requestUrl(input)

                if (url.endsWith('/api/job-posts/tracked')) {
                    trackedReads += 1
                    return jsonResponse([tracked])
                }

                if (url.endsWith('/api/job-update-check/context')) {
                    return jsonResponse(context)
                }

                if (url.endsWith('/api/job-update-check') && init?.method === 'POST') {
                    if (typeof init.body !== 'string') {
                        throw new Error('Expected job update JSON')
                    }

                    savedResult = JSON.parse(init.body)
                    return jsonResponse({ createdActivities: 1 })
                }

                throw new Error(`Unexpected request: ${url}`)
            },
        })
        vi.stubGlobal('crypto', { randomUUID: () => taskId })
        vi.stubGlobal('fetch', harness.fetch)
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const pinia = createPinia()
        const { root } = mountVue(TrackView, { install: (app) => app.use(pinia) })

        const checkButton = await vi.waitFor(() => {
            const button = root.querySelector<HTMLButtonElement>(
                '[data-testid="check-job-updates"]',
            )

            expect(button?.disabled).toBe(false)
            return button!
        })
        checkButton.click()
        await vi.waitFor(() => expect(FakeEventSource.forTask(taskId)).not.toBeUndefined())

        harness.complete(taskId, result)

        await vi.waitFor(() => {
            expect(trackedReads).toBe(2)
            expect(useAgentStore(pinia).sessions).toHaveLength(0)
        })
        expect(
            harness.requests.filter(
                ({ method, url }) => method === 'POST' && url.endsWith('/api/job-update-check'),
            ),
        ).toHaveLength(1)
        expect(savedResult).toEqual(result)
    })
})
