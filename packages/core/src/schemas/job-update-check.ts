import { z } from 'zod'
import type { AgentOutputSchema } from '../types/agent.ts'
import {
    JOB_UPDATE_SOURCES,
    type JobUpdateCheckContext,
    type JobUpdateCheckResult,
    type SavedJobUpdates,
} from '../types/job-update-check.ts'
import {
    createParser,
    httpUrlSchema,
    isoDateTimeSchema,
    nonBlankStringSchema,
    toAgentOutputSchema,
} from './shared.ts'

const jobUpdateCheckContextSchema: z.ZodType<JobUpdateCheckContext> = z.strictObject({
    posts: z.array(
        z.strictObject({
            id: z.uuid(),
            company: nonBlankStringSchema,
            roleTitle: nonBlankStringSchema,
            postUrl: httpUrlSchema,
            application: z
                .strictObject({
                    status: z.enum(['awaiting-response', 'interviewing']),
                    url: httpUrlSchema,
                    appliedAt: isoDateTimeSchema,
                })
                .nullable(),
            contacts: z.array(
                z.strictObject({
                    id: z.uuid(),
                    personName: nonBlankStringSchema,
                    personTitle: nonBlankStringSchema,
                    profileUrl: httpUrlSchema,
                    messagedAt: isoDateTimeSchema,
                }),
            ),
        }),
    ),
})

const agentId = z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
const agentDateTime = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
const agentText = z.string().regex(/\S/)
const agentUrl = z.string().regex(/^https?:\/\/\S+$/)
const evidence = {
    jobPostId: agentId,
    externalId: agentText,
    summary: agentText,
    sourceUrl: agentUrl.nullable(),
    occurredAt: agentDateTime,
}

const agentJobUpdateCheckResultSchema: z.ZodType<JobUpdateCheckResult> = z.strictObject({
    warnings: z.array(agentText),
    updates: z.array(
        z.discriminatedUnion('kind', [
            z.strictObject({
                ...evidence,
                kind: z.literal('application-status'),
                source: z.literal('gmail'),
                status: z.enum(['awaiting-response', 'interviewing', 'rejected', 'hired']),
            }),
            z.strictObject({
                ...evidence,
                kind: z.literal('outreach-response'),
                source: z.enum(JOB_UPDATE_SOURCES),
                outreachContactId: agentId,
            }),
            z.strictObject({
                ...evidence,
                kind: z.literal('review-needed'),
                source: z.enum(JOB_UPDATE_SOURCES),
                outreachContactId: agentId.nullable(),
            }),
        ]),
    ),
})
const jobUpdateCheckResultSchema: z.ZodType<JobUpdateCheckResult> = agentJobUpdateCheckResultSchema
    .superRefine(({ updates }, context) => {
        updates.forEach((update, index) => {
            if (!isoDateTimeSchema.safeParse(update.occurredAt).success) {
                context.addIssue({
                    code: 'custom',
                    path: ['updates', index, 'occurredAt'],
                    message: 'Invalid update timestamp',
                })
            }

            if (update.sourceUrl !== null && !httpUrlSchema.safeParse(update.sourceUrl).success) {
                context.addIssue({
                    code: 'custom',
                    path: ['updates', index, 'sourceUrl'],
                    message: 'Invalid source URL',
                })
            }
        })
    })
    .transform((result) => ({
        ...result,
        updates: result.updates.map((update) => ({
            ...update,
            externalId: update.externalId.trim(),
        })),
    }))

const savedJobUpdatesSchema: z.ZodType<SavedJobUpdates> = z.looseObject({
    createdActivities: z.number().int().nonnegative(),
})
const jobUpdateCheckOutputSchema = toAgentOutputSchema(agentJobUpdateCheckResultSchema)

export const createJobUpdateCheckOutputSchema = (): AgentOutputSchema =>
    structuredClone(jobUpdateCheckOutputSchema)
export const parseJobUpdateCheckContext = createParser(
    'Job update check context',
    jobUpdateCheckContextSchema,
)
export const parseJobUpdateCheckResult = createParser(
    'Job update check result',
    jobUpdateCheckResultSchema,
)
export const parseSavedJobUpdates = createParser('Saved job updates', savedJobUpdatesSchema)
