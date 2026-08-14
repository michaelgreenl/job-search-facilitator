import type { JobPost, JobSearchReport } from '@job-search-facilitator/core'
import { makeJobPost } from './job-post'

export function makeJobSearchReport(
    overrides: Partial<JobSearchReport> = {},
    post: JobPost = makeJobPost(),
): JobSearchReport {
    const id = overrides.id ?? '20000000-0000-4000-8000-000000000001'
    const reportDate = overrides.reportDate ?? '2026-07-20'

    return {
        id,
        reportDate,
        summary: 'One matching role',
        createdAt: `${reportDate}T12:00:00.000Z`,
        updatedAt: `${reportDate}T12:00:00.000Z`,
        archivedAt: null,
        results: [
            {
                agentRank: 1,
                agentLabel: 'target',
                fitRationale: 'Strong match for the role.',
                applicationFlow: 'Direct application',
                keyLegitimacySignals: 'Listed on the company careers page',
                recommendedResume: 'backend-full-stack',
                recommendedAction: 'Apply',
                legitimacyNotes: null,
                post,
                jobPostSnapshot: {
                    description: 'Complete job description',
                    sourceUrl: post.postUrl,
                    capturedAt: `${reportDate}T12:00:00.000Z`,
                },
            },
        ],
        ...overrides,
    }
}
