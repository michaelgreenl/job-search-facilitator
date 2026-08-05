import { z } from 'zod'
import {
    AGENT_LABELS,
    APPLICATION_STATUSES,
    POST_STATUSES,
    RESUME_TYPES,
    USER_LABELS,
    type ApplyQueueItem,
    type CreateUserAddedJobPostInput,
    type JobPost,
    type JobPostInput,
    type JobPostSnapshot,
    type JobRecommendationContext,
    type JobSearchReport,
    type JobSearchResult,
    type StandaloneJobRecommendation,
    type UpdateJobPostResult,
    type UserAddedJobPost,
} from '../types/jobs.ts'
import type { AgentOutputSchema } from '../types/agent.ts'
import {
    createParser,
    httpUrlSchema,
    isoDateTimeSchema,
    nonBlankStringSchema,
    toAgentOutputSchema,
} from './shared.ts'

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

export const jobPostSchema: z.ZodType<JobPost> = z.looseObject({
    id: z.uuid(),
    sourceKey: nonBlankStringSchema,
    roleTitle: nonBlankStringSchema,
    company: nonBlankStringSchema,
    location: nonBlankStringSchema.nullable(),
    compensation: nonBlankStringSchema.nullable(),
    techStack: nonBlankStringSchema,
    postSource: nonBlankStringSchema,
    postUrl: httpUrlSchema,
    applicationUrl: httpUrlSchema,
    postStatus: z.enum(POST_STATUSES),
    applicationStatus: z.enum(APPLICATION_STATUSES),
    appliedAt: isoDateTimeSchema.nullable(),
    userLabel: z.enum(USER_LABELS).nullable(),
    archivedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
})

export const jobPostSnapshotSchema: z.ZodType<JobPostSnapshot> = z.looseObject({
    description: nonBlankStringSchema,
    sourceUrl: httpUrlSchema,
    capturedAt: isoDateTimeSchema,
})

const updateJobPostResultSchema: z.ZodType<UpdateJobPostResult> = z.looseObject({
    post: jobPostSchema,
    inApplyQueue: z.boolean(),
})

const standaloneJobRecommendationShape = {
    agentLabel: z.enum(AGENT_LABELS),
    fitRationale: nonBlankStringSchema,
    applicationFlow: nonBlankStringSchema,
    keyLegitimacySignals: nonBlankStringSchema,
    recommendedResume: z.enum(RESUME_TYPES),
    recommendedAction: nonBlankStringSchema,
    legitimacyNotes: nonBlankStringSchema.nullable(),
}
const jobRecommendationShape = {
    agentRank: z.number().int().positive(),
    ...standaloneJobRecommendationShape,
}

const jobRecommendationContextSchema: z.ZodType<JobRecommendationContext> = z.looseObject({
    reportId: z.uuid(),
    reportDate: z.iso.date(),
    ...jobRecommendationShape,
})

const jobSearchResultSchema: z.ZodType<JobSearchResult> = z.looseObject({
    ...jobRecommendationShape,
    post: jobPostSchema,
})

const userAddedJobPostSchema: z.ZodType<UserAddedJobPost> = z.looseObject({
    ...standaloneJobRecommendationShape,
    post: jobPostSchema,
    addedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
})

const applyQueueItemSchema: z.ZodType<ApplyQueueItem> = z.looseObject({
    post: jobPostSchema,
    recommendationContext: jobRecommendationContextSchema.nullable(),
})

const jobSearchReportSchema: z.ZodType<JobSearchReport> = z.looseObject({
    id: z.uuid(),
    reportDate: z.iso.date(),
    summary: nonBlankStringSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    archivedAt: isoDateTimeSchema.nullable(),
    results: z.array(jobSearchResultSchema),
})

const userAddedJobPostOutputSchema = toAgentOutputSchema(createUserAddedJobPostInputSchema)

export const createUserAddedJobPostOutputSchema = (): AgentOutputSchema =>
    structuredClone(userAddedJobPostOutputSchema)

export const parseCreateUserAddedJobPostInput = createParser<CreateUserAddedJobPostInput>(
    'User-added job post input',
    createUserAddedJobPostInputSchema,
)
export const parseJobPost = createParser('Job post', jobPostSchema)
export const parseJobPosts = createParser('Job posts', z.array(jobPostSchema))
export const parseUserAddedJobPost = createParser('User-added job post', userAddedJobPostSchema)
export const parseUserAddedJobPosts = createParser(
    'User-added job posts',
    z.array(userAddedJobPostSchema),
)
export const parseApplyQueueItems = createParser('Apply queue', z.array(applyQueueItemSchema))
export const parseUpdateJobPostResult = createParser(
    'Job post update result',
    updateJobPostResultSchema,
)
export const parseJobSearchReport = createParser('Job search report', jobSearchReportSchema)
export const parseJobSearchReports = createParser(
    'Job search reports',
    z.array(jobSearchReportSchema),
)
