/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import TrackView from '@/views/TrackView.vue'
import { makeJobPost } from '@/test/fixtures/job-post'
import { makeTrackedJobPost } from '@/test/fixtures/tracked-job-post'
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
})
