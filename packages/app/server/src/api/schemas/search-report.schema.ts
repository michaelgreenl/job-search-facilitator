import { AGENT_LABELS, POST_STATUSES, RESUME_TYPES } from '@job-search-facilitator/core'
import { z } from 'zod'

const nonBlankString = z.string().trim().min(1)

export const reportDateParamsSchema = z.strictObject({
    reportDate: z.iso.date(),
})

export const jobPostInputSchema = z.strictObject({
    sourceKey: nonBlankString,
    roleTitle: nonBlankString,
    company: nonBlankString,
    location: nonBlankString.nullable(),
    compensation: nonBlankString.nullable(),
    postSource: nonBlankString,
    applicationUrl: z.url(),
    postStatus: z.enum(POST_STATUSES),
})

export const jobSearchResultInputSchema = z.strictObject({
    agentRank: z.number().int().positive(),
    agentLabel: z.enum(AGENT_LABELS),
    fitRationale: nonBlankString,
    recommendedResume: z.enum(RESUME_TYPES),
    recommendedAction: nonBlankString,
    legitimacyNotes: nonBlankString.nullable(),
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
