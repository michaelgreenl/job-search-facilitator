/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import TrackView from '@/views/TrackView.vue'
import { makeJobPost } from '@/test/fixtures/job-post'
import { makeTrackedJobPost } from '@/test/fixtures/tracked-job-post'
import { AgentBridgeHarness } from '@/test/support/agent-bridge-harness'
import { FakeEventSource } from '@/test/support/fake-event-source'
import { jsonResponse } from '@/test/support/http'
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

    it('shows active contact discovery in the tracked outreach section', async () => {
        const tracked = makeTrackedJobPost({ contacts: [] })
        FakeEventSource.reset()
        vi.stubGlobal('EventSource', FakeEventSource)
        const bridge = new AgentBridgeHarness({
            fallback: async () => jsonResponse([tracked]),
        })
        vi.stubGlobal('fetch', bridge.fetch)
        const { root } = mountVue(TrackView, {
            install: (app) => app.use(createPinia()),
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
        expect(root.querySelectorAll('[data-testid="outreach-contact-list"]')).toHaveLength(1)
        expect(
            root.querySelector('[data-testid="track-outreach-panel"]')?.getAttribute('data-active'),
        ).toBe('true')
    })
})
