/** @vitest-environment jsdom */

import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import JobPostNotesPanel from '@/components/job-posts/JobPostNotesPanel.vue'
import { usePostStore } from '@/stores/post'
import { makeJobPost } from '@/test/fixtures/job-post'
import { jsonResponse, requestParts } from '@/test/support/http'
import { mountVue } from '@/test/support/mount'

describe('JobPostNotesPanel', () => {
    it('saves edited notes to the job post and clears the unsaved state', async () => {
        const pinia = createPinia()
        const post = usePostStore(pinia).upsertPost(makeJobPost({ notes: 'Saved notes' }))
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
            jsonResponse({
                post: makeJobPost({
                    notes: 'Edited notes',
                    updatedAt: '2026-07-21T12:00:00.000Z',
                }),
                inApplyQueue: false,
            }),
        )
        vi.stubGlobal('fetch', fetchMock)
        const { root } = mountVue(JobPostNotesPanel, {
            props: { active: true, adjacent: false, post },
            install: (app) => app.use(pinia),
        })
        const notes = root.querySelector<HTMLTextAreaElement>('[data-testid="job-post-notes"]')!
        const save = root.querySelector<HTMLButtonElement>('[data-testid="save-job-post-notes"]')!

        expect(save.disabled).toBe(true)

        notes.value = 'Edited notes'
        notes.dispatchEvent(new Event('input'))
        await nextTick()
        save.click()

        await vi.waitFor(() => expect(post.notes).toBe('Edited notes'))
        const [input, init] = fetchMock.mock.calls[0]!
        expect(requestParts(input, init)).toEqual({
            method: 'PATCH',
            url: expect.stringContaining(`/job-posts/${post.id}`),
        })
        expect(init?.body).toBe(JSON.stringify({ notes: 'Edited notes' }))
        await vi.waitFor(() => expect(save.disabled).toBe(true))
    })
})
