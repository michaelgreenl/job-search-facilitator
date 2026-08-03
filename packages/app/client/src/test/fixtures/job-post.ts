import type {
    ApplyQueueItem,
    JobPost,
    JobRecommendationContext,
} from '@job-search-facilitator/core'

export function makeJobPost(overrides: Partial<JobPost> = {}): JobPost {
    const id = overrides.id ?? '10000000-0000-4000-8000-000000000001'

    return {
        id,
        sourceKey: `example:${id}`,
        roleTitle: 'Software Engineer',
        company: 'Example Co',
        location: 'Remote',
        compensation: null,
        techStack: 'TypeScript, Vue, Node.js',
        postSource: 'Greenhouse',
        postUrl: `https://example.com/jobs/${id}`,
        applicationUrl: `https://apply.example.com/jobs/${id}`,
        postStatus: 'active',
        applicationStatus: 'not-applied',
        appliedAt: null,
        userLabel: null,
        archivedAt: null,
        createdAt: '2026-07-20T12:00:00.000Z',
        updatedAt: '2026-07-20T12:00:00.000Z',
        ...overrides,
    }
}

export function makeRecommendationContext(
    overrides: Partial<JobRecommendationContext> = {},
): JobRecommendationContext {
    return {
        reportId: '20000000-0000-4000-8000-000000000001',
        reportDate: '2026-07-20',
        agentRank: 1,
        agentLabel: 'target',
        fitRationale: 'Strong match for the role.',
        applicationFlow: 'Direct application',
        keyLegitimacySignals: 'Listed on the company careers page',
        recommendedResume: 'backend-full-stack',
        recommendedAction: 'Apply',
        legitimacyNotes: null,
        ...overrides,
    }
}

export function makeApplyQueueItem(
    postOverrides: Partial<JobPost> = {},
    recommendationOverrides?: Partial<JobRecommendationContext> | null,
): ApplyQueueItem {
    return {
        post: makeJobPost(postOverrides),
        recommendationContext:
            recommendationOverrides === null
                ? null
                : makeRecommendationContext(recommendationOverrides),
    }
}
