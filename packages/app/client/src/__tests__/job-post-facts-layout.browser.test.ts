import type { StandaloneJobRecommendation } from '@job-search-facilitator/core'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import JobPostViewPanel from '@/components/job-posts/JobPostViewPanel.vue'
import { makeJobPost } from '@/test/fixtures/job-post'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

const recommendation = {
    agentLabel: 'target',
    fitRationale: 'Strong match for the role.',
    applicationFlow: 'Direct application',
    keyLegitimacySignals: 'Listed on the company careers page.',
    recommendedResume: 'frontend',
    recommendedAction: 'Apply',
    legitimacyNotes: null,
} satisfies StandaloneJobRecommendation

async function mountViewer(width: number) {
    await page.viewport(width, 900)
    mountVue(JobPostViewPanel, {
        props: {
            active: true,
            adjacent: false,
            post: makeJobPost({
                compensation: '$120,000–$160,000 plus bonus',
                techStack: 'Vue, TypeScript, Playwright, Node.js, AWS, Kubernetes',
            }),
            recommendation,
            labelUpdating: false,
            labelError: null,
            mode: {
                kind: 'apply',
                applicationUpdating: false,
                applicationError: null,
                artifactError: null,
                applicationArtifacts: [],
                artifactRemoving: null,
                artifactUploading: null,
                outreachDisabled: false,
                outreachLoading: false,
            },
        },
    })

    const resume = page.getByTestId('post-fact-resume-source').element().getBoundingClientRect()
    const compensation = page
        .getByTestId('post-fact-compensation')
        .element()
        .getBoundingClientRect()
    const techStack = page.getByTestId('post-fact-tech-stack').element().getBoundingClientRect()

    return { compensation, resume, techStack }
}

afterEach(async () => {
    await page.viewport(1024, 768)
})

describe('job post facts layout', () => {
    it('keeps the tech stack full-width below the facts in the narrow layout', async () => {
        const { compensation, resume, techStack } = await mountViewer(560)

        expect(compensation.left).toBeGreaterThan(resume.left)
        expect(techStack.left).toBe(resume.left)
        expect(techStack.right).toBe(compensation.right)
        expect(techStack.top).toBeGreaterThan(resume.bottom)
    })

    it('places compensation and tech stack together on the right in the wide layout', async () => {
        const { compensation, resume, techStack } = await mountViewer(800)

        expect(compensation.left).toBeGreaterThan(resume.right)
        expect(techStack.left).toBe(compensation.left)
        expect(techStack.right).toBe(compensation.right)
        expect(techStack.top).toBeGreaterThan(compensation.bottom)
    })
})
