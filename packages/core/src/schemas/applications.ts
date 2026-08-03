import { z } from 'zod'
import type { ApplicationCaptureResult, ApplicationSnapshot } from '../types/applications.ts'
import type { AgentOutputSchema } from '../types/agent.ts'
import {
    createParser,
    httpUrlSchema,
    isoDateTimeSchema,
    nonBlankStringSchema,
    toAgentOutputSchema,
} from './shared.ts'
export const applicationSnapshotSchema: z.ZodType<ApplicationSnapshot> = z.looseObject({
    content: nonBlankStringSchema,
    sourceUrl: httpUrlSchema,
    capturedAt: isoDateTimeSchema,
})

const applicationCaptureResultWireSchema: z.ZodType<ApplicationCaptureResult> = z.strictObject({
    jobPost: z.strictObject({
        description: z.string().regex(/\S/),
        sourceUrl: z.string().regex(/^https?:\/\/\S+$/),
    }),
    application: z.strictObject({
        content: z.string().regex(/\S/),
        sourceUrl: z.string().regex(/^https?:\/\/\S+$/),
    }),
})

export const applicationCaptureResultSchema = applicationCaptureResultWireSchema.superRefine(
    (capture, context) => {
        for (const [domain, sourceUrl] of [
            ['jobPost', capture.jobPost.sourceUrl],
            ['application', capture.application.sourceUrl],
        ] as const) {
            if (!httpUrlSchema.safeParse(sourceUrl).success) {
                context.addIssue({
                    code: 'custom',
                    path: [domain, 'sourceUrl'],
                    message: 'Invalid source URL',
                })
            }
        }
    },
) satisfies z.ZodType<ApplicationCaptureResult>

const applicationCaptureOutputSchema = toAgentOutputSchema(applicationCaptureResultWireSchema)

export const createApplicationCaptureOutputSchema = (): AgentOutputSchema =>
    structuredClone(applicationCaptureOutputSchema)
export const parseApplicationCaptureResult = createParser(
    'Application capture result',
    applicationCaptureResultSchema,
)
