import { z } from 'zod'
import { progressMessageSchema } from '../progress.ts'

type JsonObject = { [key: string]: unknown }

export const rpcIdSchema = z.union([z.string(), z.number().int()])
export type RpcId = z.infer<typeof rpcIdSchema>

export const rpcErrorSchema = z.object({ code: z.number().int(), message: z.string() })
export const emptyResponseSchema = z.object({})

export const modelListResponseSchema = z.object({
    data: z.array(
        z.object({
            model: z.string(),
            displayName: z.string(),
            hidden: z.boolean(),
            supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string() })),
        }),
    ),
    nextCursor: z.string().nullish(),
})

export const pluginInstalledResponseSchema = z.object({
    marketplaces: z.array(
        z.object({
            plugins: z.array(
                z.object({
                    id: z.string(),
                    installed: z.boolean(),
                    enabled: z.boolean(),
                    availability: z.string(),
                    source: z.object({
                        type: z.string(),
                        path: z.string().min(1).nullable().optional(),
                    }),
                }),
            ),
        }),
    ),
})

export const threadStartResponseSchema = z.object({
    thread: z.object({ id: z.string().min(1) }),
    instructionSources: z.array(z.string()).optional(),
})

export const turnStartResponseSchema = z.object({
    turn: z.object({ id: z.string().min(1) }),
})

export const turnReferenceSchema = z.object({
    threadId: z.string().min(1),
    turnId: z.string().min(1),
})

export const turnErrorSchema = turnReferenceSchema.extend({
    error: z.object({ message: z.string(), additionalDetails: z.string().nullish() }),
    willRetry: z.boolean(),
})

export const permissionResolvedSchema = z.object({
    threadId: z.string().min(1),
    requestId: rpcIdSchema,
})

export const itemStartedSchema = turnReferenceSchema.extend({
    item: z.object({ type: z.string() }),
})

// Resumed threads retain the progress tool schema from their first turn.
const legacyProgressMessages: Record<string, string> = {
    'Reviewing the task': 'Reviewing the supplied task details',
    'Verifying the job post': 'Verifying the role and employer details',
    'Reviewing job requirements': 'Reading role duties and requirements',
    'Reviewing applicant experience': 'Reviewing applicant career experience',
    'Comparing resume options': 'Comparing available resume versions',
    'Assessing role fit': 'Checking the role against your profile',
    'Checking application details': 'Verifying the direct application route',
    'Preparing the job post': 'Preparing the verified job-post result',
    'Searching for jobs': 'Searching for relevant job openings',
    'Reviewing job listings': 'Reviewing current job listings and fit',
    'Reviewing application updates': 'Checking recent application updates',
    'Checking outreach replies': 'Checking for replies to your outreach',
    'Finding hiring contacts': 'Finding contacts on the hiring team',
    'Preparing outreach': 'Drafting outreach for the selected role',
    'Preparing application documents': 'Preparing tailored application documents',
    'Reviewing resume evidence': 'Reviewing verified resume experience',
    'Preparing recommendations': 'Preparing the final recommendations',
}

export const progressToolCallSchema = turnReferenceSchema.extend({
    arguments: z.strictObject({
        message: z
            .string()
            .transform((message) => legacyProgressMessages[message] ?? message)
            .pipe(progressMessageSchema.shape.message),
    }),
})

export const itemCompletedSchema = turnReferenceSchema.extend({
    item: z.object({
        type: z.string(),
        phase: z.string().nullable().optional(),
        text: z.string().optional(),
    }),
})

export const turnCompletedSchema = z.object({
    threadId: z.string().min(1),
    turn: z.object({
        id: z.string().min(1),
        status: z.enum(['completed', 'interrupted', 'failed']),
        error: z.object({ message: z.string() }).nullable().optional(),
    }),
})

export const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
