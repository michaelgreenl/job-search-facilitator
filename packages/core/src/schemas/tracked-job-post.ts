import { z } from 'zod'
import type { TrackedJobPost } from '../types/tracked-job-post.ts'
import { applicationSnapshotSchema } from './applications.ts'
import { jobPostActivitySchema } from './job-post-activity.ts'
import { jobPostNextStepSchema, jobPostSchema, jobPostSnapshotSchema } from './jobs.ts'
import { outreachContactSchema } from './outreach.ts'
import { createParser } from './shared.ts'

const trackedJobPostSchema: z.ZodType<TrackedJobPost> = z.looseObject({
    post: jobPostSchema,
    contacts: z.array(outreachContactSchema),
    jobPostSnapshot: jobPostSnapshotSchema.nullable(),
    applicationSnapshot: applicationSnapshotSchema.nullable(),
    activities: z.array(jobPostActivitySchema),
    nextStep: jobPostNextStepSchema.nullable(),
})

export const parseTrackedJobPosts = createParser('Tracked job posts', z.array(trackedJobPostSchema))
