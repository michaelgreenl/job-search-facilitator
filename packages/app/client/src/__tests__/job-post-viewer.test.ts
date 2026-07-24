/** @vitest-environment jsdom */

import type { JobPost, JobRecommendation } from '@job-search-facilitator/core'
import { createApp } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JobPostViewer from '@/components/job-posts/JobPostViewer.vue'

const post = {
    id: 'post-id',
    sourceKey: 'example:post-id',
    roleTitle: 'Software Engineer',
    company: 'Example Company',
    location: 'Remote',
    compensation: '$120,000',
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Greenhouse',
    postUrl: 'https://example.com/jobs/post-id',
    applicationUrl: 'https://apply.example.com/jobs/post-id',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userLabel: 'P1',
    archivedAt: null,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
} satisfies JobPost

const recommendation = {
    agentRank: 1,
    agentLabel: 'target',
    fitRationale:
        'The role matches the candidate’s TypeScript product work and backend integration experience.',
    applicationFlow: 'Direct application',
    keyLegitimacySignals:
        'The role appears on the company careers site and links to its established Greenhouse account.',
    recommendedResume: 'backend-full-stack',
    recommendedAction: 'Apply with the backend/full-stack resume.',
    legitimacyNotes: 'The company and role details are consistent across both sources.',
} satisfies JobRecommendation

const mountedApps: Array<{ app: ReturnType<typeof createApp>; root: HTMLElement }> = []

function mountViewer(
    overrides: Partial<JobPost> = {},
    options: {
        alwaysShowApplicationAction?: boolean
        recommendation?: JobRecommendation
        showLegitimacy?: boolean
    } = {},
) {
    const root = document.createElement('div')
    document.body.append(root)
    const selectedPost = { ...post, ...overrides }

    const app = createApp(JobPostViewer, {
        post: selectedPost,
        recommendation: options.recommendation,
        showLegitimacy: options.showLegitimacy,
        labelUpdating: false,
        labelError: null,
        alwaysShowApplicationAction: options.alwaysShowApplicationAction,
    })
    app.mount(root)
    mountedApps.push({ app, root })

    return root
}

async function openLabelOptions(root: HTMLElement) {
    const trigger = root.querySelector<HTMLButtonElement>('[aria-label="Job post label"]')

    if (trigger === null) {
        throw new Error('Could not find label dropdown trigger')
    }

    trigger.click()
    await vi.waitFor(() => expect(root.querySelector('[role="menu"]')).not.toBeNull())

    return [...root.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(({ textContent }) =>
        textContent?.trim(),
    )
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
            'Open post ↗',
            'Open application ↗',
        ])
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

    it('includes a shared application destination when requested', () => {
        const root = mountViewer(
            { applicationUrl: post.postUrl },
            { alwaysShowApplicationAction: true },
        )
        const links = [...root.querySelectorAll<HTMLAnchorElement>('.post-action-button')]

        expect(links.map(({ textContent }) => textContent?.trim())).toEqual([
            'Open post ↗',
            'Open application ↗',
        ])
        expect(links.map(({ href }) => href)).toEqual([post.postUrl, post.postUrl])
    })

    it('does not repeat a shared post and application destination', () => {
        const root = mountViewer({ applicationUrl: post.postUrl })
        const links = [...root.querySelectorAll<HTMLAnchorElement>('.post-action-button')]

        expect(links.map(({ textContent }) => textContent?.trim())).toEqual(['Open post ↗'])
    })

    it('omits unsafe external destinations', () => {
        const root = mountViewer({
            postUrl: 'javascript:alert(1)',
            applicationUrl: 'data:text/html,unsafe',
        })

        expect(root.querySelector('.post-action-button')).toBeNull()
    })

    it('shows the available post facts without inventing search-result context', () => {
        const root = mountViewer()
        const facts = [...root.querySelectorAll('.post-fact')].map((fact) => ({
            label: fact.querySelector('dt')?.textContent?.trim(),
            value: fact.querySelector('dd')?.textContent?.trim(),
        }))

        expect(facts).toEqual([
            { label: 'Compensation', value: '$120,000' },
            { label: 'Source', value: 'Greenhouse' },
            { label: 'Tech stack', value: 'TypeScript, Vue, Node.js' },
        ])
        expect(root.textContent).not.toContain('Recommended action')
        expect(root.textContent).not.toContain('Why it fits')
        expect(root.textContent).not.toContain('Legitimacy')
        expect(root.textContent).not.toContain('Selected post:')
    })

    it('lays out the complete search recommendation and legitimacy context', () => {
        const root = mountViewer({}, { recommendation })
        const text = root.textContent ?? ''

        expect(text).toContain('Recommended action')
        expect(text).toContain(recommendation.recommendedAction)
        expect(text).toContain('Recommended resume')
        expect(text).toContain('Backend / full-stack')
        expect(text).toContain('Tech stack')
        expect(text).toContain(post.techStack)
        expect(text).toContain('Compensation')
        expect(text).toContain(post.compensation)
        expect(text).toContain('Source')
        expect(text).toContain(post.postSource)
        expect(text).toContain('Why it fits')
        expect(text).toContain(recommendation.fitRationale)
        expect(text).toContain('Key signals')
        expect(text).toContain(recommendation.keyLegitimacySignals)
        expect(text).toContain('Notes')
        expect(text).toContain(recommendation.legitimacyNotes)
    })

    it('can show recommendation context without review-only legitimacy', () => {
        const root = mountViewer({}, { recommendation, showLegitimacy: false })
        const text = root.textContent ?? ''

        expect(text).toContain('Recommendation')
        expect(text).toContain(recommendation.recommendedAction)
        expect(text).toContain(recommendation.fitRationale)
        expect(text).not.toContain('Legitimacy')
        expect(text).not.toContain(recommendation.keyLegitimacySignals)
        expect(text).not.toContain(recommendation.legitimacyNotes)
    })

    it('collapses absent AI content and nullable post facts without empty sections', () => {
        const sparseRecommendation = {
            ...recommendation,
            fitRationale: '',
            keyLegitimacySignals: '',
            recommendedAction: '',
            legitimacyNotes: null,
        }
        const root = mountViewer(
            {
                compensation: null,
                techStack: 'Not recorded',
                postSource: '',
            },
            { recommendation: sparseRecommendation },
        )
        const facts = [...root.querySelectorAll('.post-fact')].map((fact) => ({
            label: fact.querySelector('dt')?.textContent?.trim(),
            value: fact.querySelector('dd')?.textContent?.trim(),
        }))

        expect(facts).toEqual([{ label: 'Recommended resume', value: 'Backend / full-stack' }])
        expect(root.querySelector('.recommended-action')).toBeNull()
        expect(root.querySelector('.post-analysis')).toBeNull()
        expect(root.querySelectorAll('dd:empty, p:empty')).toHaveLength(0)
    })

    it('omits the clear-label option when the post has no label', async () => {
        const root = mountViewer({ userLabel: null })

        expect(await openLabelOptions(root)).not.toContain('Clear label')
    })

    it('keeps the clear-label option for a labeled post', async () => {
        const root = mountViewer()

        expect(await openLabelOptions(root)).toContain('Clear label')
    })
})
