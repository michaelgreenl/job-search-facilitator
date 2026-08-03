import { z } from 'zod'
import type { AgentOutputSchema } from '../types/agent.ts'
import { APPLICATION_STATUSES } from '../types/jobs.ts'
import {
    TRACKING_ACTIVITY_TYPES,
    TRACKING_AUTOMATION_SOURCES,
    type TrackingAutomationContext,
    type TrackingAutomationResult,
} from '../types/tracking.ts'
import {
    createParser,
    httpUrlSchema,
    isoDateTimeSchema,
    nonBlankStringSchema,
    toAgentOutputSchema,
} from './shared.ts'

const trackingAutomationContextSchema: z.ZodType<TrackingAutomationContext> = z.strictObject({
    requestedAt: isoDateTimeSchema,
    posts: z.array(
        z.strictObject({
            id: z.uuid(),
            company: nonBlankStringSchema,
            roleTitle: nonBlankStringSchema,
            postUrl: httpUrlSchema,
            applicationUrl: httpUrlSchema,
            applicationStatus: z.enum(APPLICATION_STATUSES),
            eligibleSince: isoDateTimeSchema,
            lastObservedAt: z.strictObject({
                gmail: isoDateTimeSchema.nullable(),
                linkedin: isoDateTimeSchema.nullable(),
            }),
            contacts: z.array(
                z.strictObject({
                    id: z.uuid(),
                    personName: nonBlankStringSchema,
                    personTitle: nonBlankStringSchema,
                    profileUrl: httpUrlSchema,
                    messagedAt: isoDateTimeSchema,
                    status: z.enum(['response-pending', 'responded']),
                }),
            ),
        }),
    ),
})

const agentUuid = z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
const agentDateTime = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
const agentText = z.string().regex(/\S/)
const agentUrl = z.string().regex(/^https?:\/\/\S+$/)

const observationSourceSchema = z.strictObject({
    source: z.enum(TRACKING_AUTOMATION_SOURCES),
    externalId: agentText,
    type: z.enum(TRACKING_ACTIVITY_TYPES),
})

const trackingAutomationResultWireSchema = z.strictObject({
    sourceErrors: z.strictObject({
        gmail: agentText.nullable(),
        linkedin: agentText.nullable(),
    }),
    observations: z.array(
        z.strictObject({
            jobPostId: agentUuid,
            outreachContactId: agentUuid.nullable(),
            type: z.enum(TRACKING_ACTIVITY_TYPES),
            applicationStatus: z
                .enum(['awaiting-response', 'interviewing', 'rejected', 'hired'])
                .nullable(),
            source: z.enum(TRACKING_AUTOMATION_SOURCES),
            externalId: agentText,
            summary: agentText,
            sourceUrl: agentUrl.nullable(),
            occurredAt: agentDateTime,
        }),
    ),
    nextSteps: z.array(
        z.strictObject({
            jobPostId: agentUuid,
            title: agentText,
            dueAt: agentDateTime,
            source: observationSourceSchema.nullable(),
        }),
    ),
})

const trackingAutomationResultSchema: z.ZodType<TrackingAutomationResult> =
    trackingAutomationResultWireSchema.refine(
        ({ observations }) =>
            observations.every(
                ({ type, outreachContactId, applicationStatus }) =>
                    (type !== 'application-status-changed' || applicationStatus !== null) &&
                    (!['outreach-sent', 'outreach-response-received'].includes(type) ||
                        outreachContactId !== null),
            ),
        { message: 'Observation is missing required state' },
    )

const trackingAutomationOutputSchema = toAgentOutputSchema(trackingAutomationResultWireSchema)

export const createTrackingAutomationOutputSchema = (): AgentOutputSchema =>
    structuredClone(trackingAutomationOutputSchema)
export const parseTrackingAutomationContext = createParser(
    'Tracking automation context',
    trackingAutomationContextSchema,
)
export const parseTrackingAutomationResult = createParser(
    'Tracking automation result',
    trackingAutomationResultSchema,
)
