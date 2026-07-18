import { z } from 'zod'

const nonBlankString = z.string().trim().min(1)

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
        workTaskId: z.uuid(),
        workThreadId: nonBlankString,
        workTurnId: nonBlankString,
    }),
    z.strictObject({ status: z.literal('completed') }),
    z.strictObject({
        status: z.literal('failed'),
        error: z.string().trim().min(1),
    }),
])
