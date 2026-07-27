import { z } from 'zod'
import { POST_STATUSES, type JobPostInput } from './job-post.ts'
import { AGENT_LABELS, RESUME_TYPES } from './search-report.ts'
import type {
    CreateUserAddedJobPostInput,
    StandaloneJobRecommendation,
} from './user-added-job-post.ts'

const nonBlankInputStringSchema = z.string().regex(/\S/).trim()
const httpUrlInputSchema = z
    .string()
    .regex(
        /^https?:\/\/(?:localhost|(?:(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?|(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9]))(?::(?:0|[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?(?:[/?#][^\s]*)?$/,
    )

export const jobPostInputSchema = z.strictObject({
    sourceKey: nonBlankInputStringSchema,
    roleTitle: nonBlankInputStringSchema,
    company: nonBlankInputStringSchema,
    location: nonBlankInputStringSchema.nullable(),
    compensation: nonBlankInputStringSchema.nullable(),
    techStack: nonBlankInputStringSchema,
    postSource: nonBlankInputStringSchema,
    postUrl: httpUrlInputSchema,
    applicationUrl: httpUrlInputSchema,
    postStatus: z.enum(POST_STATUSES),
}) satisfies z.ZodType<JobPostInput>

export const standaloneJobRecommendationInputSchema = z.strictObject({
    agentLabel: z.enum(AGENT_LABELS),
    fitRationale: nonBlankInputStringSchema,
    applicationFlow: nonBlankInputStringSchema,
    keyLegitimacySignals: nonBlankInputStringSchema,
    recommendedResume: z.enum(RESUME_TYPES),
    recommendedAction: nonBlankInputStringSchema,
    legitimacyNotes: nonBlankInputStringSchema.nullable(),
}) satisfies z.ZodType<StandaloneJobRecommendation>

export const createUserAddedJobPostInputSchema = z.strictObject({
    ...standaloneJobRecommendationInputSchema.shape,
    post: jobPostInputSchema,
}) satisfies z.ZodType<CreateUserAddedJobPostInput>
