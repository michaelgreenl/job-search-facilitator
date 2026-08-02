/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import TrackView from '@/views/TrackView.vue'
import { usePostStore } from '@/stores/post'
import { makeJobPost } from '@/test/fixtures/job-post'
import { jsonResponse } from '@/test/support/http'
import { mountVue } from '@/test/support/mount'

describe('track view', () => {
    it('loads only tracked posts into its job-post list panel', async () => {
        const appliedPost = makeJobPost({
            id: '30000000-0000-4000-8000-000000000001',
            applicationStatus: 'awaiting-response',
        })
        const messagedPost = makeJobPost({
            id: '30000000-0000-4000-8000-000000000002',
        })
        const unrelatedCachedPost = makeJobPost({
            id: '30000000-0000-4000-8000-000000000003',
        })
        const pinia = createPinia()
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse([appliedPost, messagedPost]))
        vi.stubGlobal('fetch', fetchMock)
        usePostStore(pinia).upsertPost(unrelatedCachedPost)

        const { root } = mountVue(TrackView, { install: (app) => app.use(pinia) })

        await vi.waitFor(() =>
            expect(
                root.querySelector(`[data-testid="job-post-card-${appliedPost.id}"]`),
            ).not.toBeNull(),
        )

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
            'http://localhost:3000/api/job-posts/tracked',
            undefined,
        )
        expect(
            root.querySelector(`[data-testid="job-post-card-${messagedPost.id}"]`),
        ).not.toBeNull()
        expect(
            root.querySelector(`[data-testid="job-post-card-${unrelatedCachedPost.id}"]`),
        ).toBeNull()
    })
})
