import type { ApplicationSnapshot } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'

type PrismaApplicationSnapshot = Prisma.ApplicationSnapshotGetPayload<object>

export const toApplicationSnapshot = (
    snapshot: PrismaApplicationSnapshot,
): ApplicationSnapshot => ({
    content: snapshot.content,
    sourceUrl: snapshot.sourceUrl,
    capturedAt: snapshot.capturedAt.toISOString(),
})
