/** @vitest-environment jsdom */

import type { JobPost } from '@job-search-facilitator/core'
import { h, nextTick, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import JobPostListPanel from '@/components/job-posts/JobPostListPanel.vue'
import { makeJobPost } from '@/test/fixtures/job-post'
import { mountVue } from '@/test/support/mount'

const createPost = (id: string, userLabel: JobPost['userLabel']): JobPost =>
    makeJobPost({
        id,
        applicationUrl: `https://example.com/jobs/${id}/apply`,
        techStack: 'TypeScript',
        postSource: 'Company careers',
        userLabel,
        createdAt: '2026-07-27T12:00:00.000Z',
        updatedAt: '2026-07-27T12:00:00.000Z',
    })

const renderedPostIds = (root: HTMLElement) => {
    const list = root.querySelector<HTMLElement>('[data-testid="job-post-list"]')

    if (list === null) {
        throw new Error('Could not find job post list')
    }

    return [...list.children].flatMap((item) => {
        const testId = item.firstElementChild?.getAttribute('data-testid')
        return testId?.startsWith('job-post-card-') ? [testId.replace('job-post-card-', '')] : []
    })
}

describe('JobPostListPanel', () => {
    it('keeps an in-progress import reachable when loading saved posts fails', () => {
        const { root } = mountVue({
            render: () =>
                h(JobPostListPanel, {
                    active: true,
                    adjacent: false,
                    eyebrow: 'Job posts',
                    title: 'Posts',
                    posts: [],
                    selectedPostId: null,
                    emptyMessage: 'No posts',
                    error: 'Could not load posts',
                    pending: true,
                }),
        })

        expect(root.querySelector('[data-testid="job-post-import-progress"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="job-post-list-retry"]')).not.toBeNull()
    })

    it('moves forgone posts last and restores source order when the label is removed', async () => {
        const forgoneFirst = createPost('10000000-0000-4000-8000-000000000001', 'forgo')
        const normalFirst = createPost('10000000-0000-4000-8000-000000000002', null)
        const forgoneSecond = createPost('10000000-0000-4000-8000-000000000003', 'forgo')
        const normalSecond = createPost('10000000-0000-4000-8000-000000000004', 'P1')
        const posts = reactive([forgoneFirst, normalFirst, forgoneSecond, normalSecond])
        const { root } = mountVue({
            render: () =>
                h(JobPostListPanel, {
                    active: true,
                    adjacent: false,
                    eyebrow: 'Job posts',
                    title: 'Posts',
                    posts,
                    selectedPostId: null,
                    emptyMessage: 'No posts',
                }),
        })

        expect(renderedPostIds(root)).toEqual([
            normalFirst.id,
            normalSecond.id,
            forgoneFirst.id,
            forgoneSecond.id,
        ])

        posts[0]!.userLabel = null
        await nextTick()

        expect(renderedPostIds(root)).toEqual([
            forgoneFirst.id,
            normalFirst.id,
            normalSecond.id,
            forgoneSecond.id,
        ])
    })
})
