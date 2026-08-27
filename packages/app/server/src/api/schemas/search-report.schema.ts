import {
    jobPostInputSchema,
    REPORT_RESUME_TYPES,
    standaloneJobRecommendationInputSchema,
} from '@job-search-facilitator/core'
import { z } from 'zod'

const nonBlankString = z.string().trim().min(1)

export const reportIdParamsSchema = z.strictObject({
    reportId: z.uuid(),
})

export const reportUpsertParamsSchema = z.strictObject({
    reportDate: z.iso.date(),
    reportId: z.uuid(),
})

export const reportUpsertQuerySchema = z.strictObject({
    requireNetNew: z.literal('true').optional(),
})

export { jobPostInputSchema }

export const jobSearchResultInputSchema = z.strictObject({
    agentRank: z.number().int().positive(),
    ...standaloneJobRecommendationInputSchema.shape,
    recommendedResume: z.enum(REPORT_RESUME_TYPES),
    post: jobPostInputSchema,
})

export const upsertJobSearchReportInputSchema = z
    .strictObject({
        summary: nonBlankString,
        results: z.array(jobSearchResultInputSchema),
    })
    .superRefine((input, context) => {
        const agentRanks = new Set<number>()
        const sourceKeys = new Set<string>()

        input.results.forEach((result, index) => {
            if (agentRanks.has(result.agentRank)) {
                context.addIssue({
                    code: 'custom',
                    message: 'Agent ranks must be unique',
                    path: ['results', index, 'agentRank'],
                })
            }

            if (sourceKeys.has(result.post.sourceKey)) {
                context.addIssue({
                    code: 'custom',
                    message: 'Post source keys must be unique',
                    path: ['results', index, 'post', 'sourceKey'],
                })
            }

            agentRanks.add(result.agentRank)
            sourceKeys.add(result.post.sourceKey)
        })
    })
