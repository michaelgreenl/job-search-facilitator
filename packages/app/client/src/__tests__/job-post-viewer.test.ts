/** @vitest-environment jsdom */

import type { JobPost } from '@job-search-facilitator/core'
import { createApp } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import JobPostViewer from '@/components/job-posts/JobPostViewer.vue'

const post = {
    id: 'post-id',
    sourceKey: 'example:post-id',
    roleTitle: 'Software Engineer',
    company: 'Example Company',
    location: 'Remote',
    compensation: '$120,000',
    postSource: 'Greenhouse',
    postUrl: 'https://example.com/jobs/post-id',
    applicationUrl: 'https://apply.example.com/jobs/post-id',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel: 'P1',
    archivedAt: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
} satisfies JobPost

const mountedApps: Array<{ app: ReturnType<typeof createApp>; root: HTMLElement }> = []

function mountViewer(overrides: Partial<JobPost> = {}) {
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(JobPostViewer, {
        post: { ...post, ...overrides },
        labelUpdating: false,
        labelError: null,
    })
    app.mount(root)
    mountedApps.push({ app, root })

    return root
}

describe('JobPostViewer', () => {
    afterEach(() => {
        for (const { app, root } of mountedApps.splice(0)) {
            app.unmount()
            root.remove()
        }
    })

    it('opens the post and distinct application destinations', () => {
        const root = mountViewer()
        const links = [...root.querySelectorAll<HTMLAnchorElement>('.post-action-button')]

        expect(links.map(({ textContent }) => textContent?.trim())).toEqual([
            'Open post',
            'Open application',
        ])
        expect(links.every((link) => link.querySelector('.app-icon-external-link'))).toBe(true)
        expect(links.map(({ href }) => href)).toEqual([post.postUrl, post.applicationUrl])
        expect(links.map((link) => link.getAttribute('target'))).toEqual(['_blank', '_blank'])
        expect(links.map((link) => link.getAttribute('rel'))).toEqual([
            'noopener noreferrer',
            'noopener noreferrer',
        ])
        expect(links[1]?.getAttribute('aria-label')).toBe(
            `Open application for ${post.roleTitle} in a new tab`,
        )
    })

    it('does not repeat a shared post and application destination', () => {
        const root = mountViewer({ applicationUrl: post.postUrl })
        const links = [...root.querySelectorAll<HTMLAnchorElement>('.post-action-button')]

        expect(links.map(({ textContent }) => textContent?.trim())).toEqual(['Open post'])
    })

    it('omits unsafe external destinations', () => {
        const root = mountViewer({
            postUrl: 'javascript:alert(1)',
            applicationUrl: 'data:text/html,unsafe',
        })

        expect(root.querySelector('.post-action-button')).toBeNull()
    })
})
