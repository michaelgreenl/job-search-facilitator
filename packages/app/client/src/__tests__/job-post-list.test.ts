/** @vitest-environment jsdom */

import { createApp, h, type App } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import JobPostList from '@/components/job-posts/JobPostList.vue'

const mountedApps: Array<{ app: App; root: HTMLElement }> = []

afterEach(() => {
    for (const { app, root } of mountedApps.splice(0)) {
        app.unmount()
        root.remove()
    }
})

describe('JobPostList', () => {
    it('keeps an in-progress import reachable when loading saved posts fails', () => {
        const root = document.createElement('div')
        document.body.append(root)

        const app = createApp({
            render: () =>
                h(JobPostList, {
                    posts: [],
                    selectedPostId: null,
                    emptyMessage: 'No posts',
                    error: 'Could not load posts',
                    pending: true,
                }),
        })
        app.mount(root)
        mountedApps.push({ app, root })

        expect(root.querySelector('[data-testid="job-post-import-progress"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="job-post-list-retry"]')).not.toBeNull()
    })
})
