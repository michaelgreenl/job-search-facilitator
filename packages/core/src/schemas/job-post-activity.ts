import { z } from 'zod'
import type { JobPostActivity } from '../types/job-post-activity.ts'
import { httpUrlSchema, isoDateTimeSchema, nonBlankStringSchema } from './shared.ts'

export const jobPostActivitySchema: z.ZodType<JobPostActivity> = z.looseObject({
    id: z.uuid(),
    summary: nonBlankStringSchema,
    sourceUrl: httpUrlSchema.nullable(),
    occurredAt: isoDateTimeSchema,
})
