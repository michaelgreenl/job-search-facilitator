import { z } from 'zod'

const nonBlankString = z.string().trim().min(1)
const linkedInProfileUrl = z
    .string()
    .trim()
    .url()
    .refine((value) => {
        const url = new URL(value)
        const linkedInHost =
            url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')

        return url.protocol === 'https:' && linkedInHost && url.pathname.startsWith('/in/')
    })

export const outreachContactJobPostParamsSchema = z.strictObject({
    jobPostId: z.uuid(),
})

export const outreachContactParamsSchema = z.strictObject({
    jobPostId: z.uuid(),
    contactId: z.uuid(),
})

export const outreachContactInputSchema = z.strictObject({
    personName: nonBlankString,
    personTitle: nonBlankString,
    profileUrl: linkedInProfileUrl,
    relevanceRationale: nonBlankString,
    draftMessage: nonBlankString,
})

export const updateOutreachContactInputSchema = z.strictObject({
    messaged: z.boolean(),
})

export const outreachRunIdParamsSchema = z.strictObject({
    runId: z.uuid(),
})

export const createOutreachRunInputSchema = z.strictObject({
    jobPostId: z.uuid(),
    requestedContactCount: z.union([z.literal(2), z.literal(3)]),
})

export const updateOutreachRunInputSchema = z.discriminatedUnion('status', [
    z.strictObject({
        status: z.literal('running'),
        agentTaskId: z.uuid(),
        agentThreadId: nonBlankString,
        agentTurnId: nonBlankString,
    }),
    z.strictObject({ status: z.literal('completed') }),
    z.strictObject({
        status: z.literal('failed'),
        error: z.string().trim().min(1),
    }),
])
