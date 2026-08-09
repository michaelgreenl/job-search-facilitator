import type { JobPostInput } from '@job-search-facilitator/core'
import { describe, expect, it, vi } from 'vitest'
import { lockJobPostIdentities } from '../src/db/lock-job-post-identities.ts'
import { identityTokensForPost } from '../src/job-post-identity.ts'

type IdentityPost = Pick<JobPostInput, 'sourceKey' | 'postUrl' | 'applicationUrl'>

const capturedLockOrder = async (posts: IdentityPost[]): Promise<string[]> => {
    const tokens: string[] = []
    const transaction = {
        $queryRaw: vi.fn(async (_query: unknown, token: unknown) => {
            tokens.push(String(token))
            return [{ locked: false }]
        }),
    } as unknown as Parameters<typeof lockJobPostIdentities>[0]

    await lockJobPostIdentities(transaction, posts)

    return tokens
}

describe('job post identity locks', () => {
    it('acquires each derived token once in stable sorted order', async () => {
        const posts: IdentityPost[] = [
            {
                sourceKey: 'source:z',
                postUrl: 'https://example.com/jobs/shared?utm_source=board',
                applicationUrl: 'https://example.com/jobs/shared/apply',
            },
            {
                sourceKey: 'source:a',
                postUrl: 'https://job-boards.greenhouse.io/example/jobs/1234567',
                applicationUrl: 'https://job-boards.greenhouse.io/example/jobs/1234567/application',
            },
        ]
        const expected = [...new Set(posts.flatMap(identityTokensForPost))].sort()
        const forward = await capturedLockOrder(posts)
        const reverse = await capturedLockOrder([...posts].reverse())

        expect({ forward, reverse }).toEqual({ forward: expected, reverse: expected })
    })
})
