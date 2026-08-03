import type { JobPostActivity, JobUpdateSource } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'

type PrismaActivity = Prisma.JobPostActivityGetPayload<object>

export const activitySourceToPrisma = {
    gmail: 'GMAIL',
    linkedin: 'LINKEDIN',
} satisfies Record<JobUpdateSource, PrismaActivity['source']>

export const toJobPostActivity = (activity: PrismaActivity): JobPostActivity => ({
    id: activity.id,
    summary: activity.summary,
    sourceUrl: activity.sourceUrl,
    occurredAt: activity.occurredAt.toISOString(),
})
