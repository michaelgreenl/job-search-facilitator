import type { JobPostInput } from '@job-search-facilitator/core'
import type { Prisma } from '@job-search-facilitator/core/prisma'
import { identityTokensForPost } from '../job-post-identity.ts'

type IdentityPost = Pick<JobPostInput, 'sourceKey' | 'postUrl' | 'applicationUrl'>

export const lockJobPostIdentities = async (
    transaction: Prisma.TransactionClient,
    posts: IdentityPost[],
): Promise<void> => {
    const tokens = [...new Set(posts.flatMap(identityTokensForPost))].sort()

    // A stable order makes overlapping multi-post transactions wait instead of deadlocking.
    for (const token of tokens) {
        await transaction.$queryRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${token}, 0)) IS NULL AS "locked"
        `
    }
}
