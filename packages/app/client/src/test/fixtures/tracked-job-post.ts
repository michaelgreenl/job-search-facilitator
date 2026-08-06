import type { TrackedJobPost } from '@job-search-facilitator/core'
import { makeJobPost } from './job-post'
import { makeOutreachContact } from './outreach'

export function makeTrackedJobPost(overrides: Partial<TrackedJobPost> = {}): TrackedJobPost {
    const post =
        overrides.post ??
        makeJobPost({
            applicationStatus: 'awaiting-response',
            appliedAt: '2026-07-20T12:00:00.000Z',
        })

    return {
        post,
        contacts: [
            makeOutreachContact({
                jobPostId: post.id,
                messaged: true,
                messagedAt: '2026-07-20T12:00:00.000Z',
            }),
        ],
        jobPostSnapshot: null,
        applicationArtifacts: [],
        activities: [],
        ...overrides,
    }
}
