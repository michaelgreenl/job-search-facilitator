/** @vitest-environment jsdom */

import type { JobPost, StandaloneJobRecommendation } from '@job-search-facilitator/core'
import { describe, expect, it, vi } from 'vitest'
import JobPostViewPanel from '@/components/job-posts/JobPostViewPanel.vue'
import { makeJobPost } from '@/test/fixtures/job-post'
import { mountVue } from '@/test/support/mount'

const post = makeJobPost({
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
    userLabel: 'P1',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
})

const recommendation = {
    agentLabel: 'target',
    fitRationale:
        'The role matches the candidate’s TypeScript product work and backend integration experience.',
    applicationFlow: 'Direct application',
    keyLegitimacySignals:
        'The role appears on the company careers site and links to its established Greenhouse account.',
    recommendedResume: 'backend-full-stack',
    recommendedAction: 'Apply with the backend/full-stack resume.',
    legitimacyNotes: 'The company and role details are consistent across both sources.',
} satisfies StandaloneJobRecommendation

function mountViewer(
    overrides: Partial<JobPost> = {},
    options: { description?: string; recommendation?: StandaloneJobRecommendation } = {},
) {
    const { root } = mountVue(JobPostViewPanel, {
        props: {
            active: true,
            adjacent: false,
            post: { ...post, ...overrides },
            description: options.description,
            recommendation: options.recommendation,
            labelUpdating: false,
            labelError: null,
            mode: { kind: 'review' },
        },
    })

    return root
}

async function openLabelOptions(root: HTMLElement) {
    const trigger = root.querySelector<HTMLButtonElement>('[data-testid="job-label-trigger"]')

    if (trigger === null) {
        throw new Error('Could not find label dropdown trigger')
    }

    trigger.click()
    await vi.waitFor(() =>
        expect(root.querySelector('[data-testid="job-label-menu"]')).not.toBeNull(),
    )
}

describe('JobPostViewPanel', () => {
    it('exposes distinct safe post and application destinations', () => {
        const root = mountViewer()
        const postLink = root.querySelector<HTMLAnchorElement>('[data-testid="post-link"]')
        const applicationLink = root.querySelector<HTMLAnchorElement>(
            '[data-testid="application-link"]',
        )

        expect(postLink?.href).toBe(post.postUrl)
        expect(applicationLink?.href).toBe(post.applicationUrl)

        for (const link of [postLink, applicationLink]) {
            expect(link?.target).toBe('_blank')
            expect(link?.rel).toBe('noopener noreferrer')
        }
    })

    it('deduplicates a shared destination in review mode', () => {
        const root = mountViewer({ applicationUrl: post.postUrl })

        expect(root.querySelector('[data-testid="post-link"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="application-link"]')).toBeNull()
    })

    it('omits unsafe external destinations', () => {
        const root = mountViewer({
            postUrl: 'javascript:alert(1)',
            applicationUrl: 'data:text/html,unsafe',
        })

        expect(root.querySelector('[data-testid="post-link"]')).toBeNull()
        expect(root.querySelector('[data-testid="application-link"]')).toBeNull()
    })

    it('keeps recommendation sections absent when no recommendation is provided', () => {
        const root = mountViewer()

        expect(root.querySelector('[data-testid="post-facts"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="post-recommendation"]')).toBeNull()
        expect(root.querySelector('[data-testid="post-legitimacy"]')).toBeNull()
    })

    it('exposes recommendation and legitimacy sections when that context is available', () => {
        const root = mountViewer({}, { recommendation })

        expect(root.querySelector('[data-testid="post-recommendation"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="post-legitimacy"]')).not.toBeNull()
    })

    it('renders the job description as the final content section', () => {
        const root = mountViewer({}, { description: 'Complete job description' })
        const description = root.querySelector('[data-testid="post-description"]')

        expect(description).not.toBeNull()
        expect(description?.parentElement?.lastElementChild).toBe(description)
    })

    it('omits empty optional recommendation sections', () => {
        const root = mountViewer(
            {
                compensation: null,
                techStack: 'Not recorded',
                postSource: '',
            },
            {
                recommendation: {
                    ...recommendation,
                    fitRationale: '',
                    keyLegitimacySignals: '',
                    recommendedAction: '',
                    legitimacyNotes: null,
                },
            },
        )

        expect(root.querySelector('[data-testid="post-facts"]')).not.toBeNull()
        expect(root.querySelector('[data-testid="post-recommendation"]')).toBeNull()
        expect(root.querySelector('[data-testid="post-legitimacy"]')).toBeNull()
    })

    it.each([
        { userLabel: null, expected: false },
        { userLabel: 'P1' as const, expected: true },
    ])('sets clear-label availability for $userLabel', async ({ userLabel, expected }) => {
        const root = mountViewer({ userLabel })

        await openLabelOptions(root)

        expect(root.querySelector('[data-testid="job-label-option-clear"]') !== null).toBe(expected)
    })
})
