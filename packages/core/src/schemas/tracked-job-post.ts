import { z } from 'zod'
import type { TrackedJobPost } from '../types/tracked-job-post.ts'
import { applicationArtifactSchema } from './applications.ts'
import { jobPostActivitySchema } from './job-post-activity.ts'
import { jobPostSchema, jobPostSnapshotSchema } from './jobs.ts'
import { outreachContactSchema } from './outreach.ts'
import { createParser } from './shared.ts'

const trackedJobPostSchema: z.ZodType<TrackedJobPost> = z.looseObject({
    post: jobPostSchema,
    contacts: z.array(outreachContactSchema),
    jobPostSnapshot: jobPostSnapshotSchema.nullable(),
    applicationArtifacts: z.array(applicationArtifactSchema),
    activities: z.array(jobPostActivitySchema),
})

export const parseTrackedJobPosts = createParser('Tracked job posts', z.array(trackedJobPostSchema))
