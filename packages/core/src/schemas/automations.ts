import { z } from 'zod'
import { agentModelSelectionSchema, agentProviderSchema } from './agent-settings.ts'
import { createParser, isoDateTimeSchema } from './shared.ts'

export const AUTOMATION_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export const MAX_AUTOMATION_TIMES = 24

export const automationScheduleSchema = z.strictObject({
    days: z
        .array(z.enum(AUTOMATION_DAYS))
        .min(1)
        .max(7)
        .refine((days) => new Set(days).size === days.length),
    times: z
        .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
        .min(1)
        .max(MAX_AUTOMATION_TIMES)
        .refine((times) => new Set(times).size === times.length)
        .transform((times) => times.sort()),
})

const automationRunSchema = z.object({
    status: z.enum(['running', 'completed', 'failed', 'cancelled']),
    startedAt: isoDateTimeSchema,
    finishedAt: isoDateTimeSchema.nullable(),
    /** The latest progress text while running, then the result or the failure reason. */
    message: z.string().nullable(),
})

const automationSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    provider: agentProviderSchema,
    status: z.enum(['ACTIVE', 'PAUSED']),
    /** False when only the provider's desktop app can change the status and schedule. */
    scheduleEditable: z.boolean(),
    schedule: automationScheduleSchema.nullable(),
    timeZone: z.string().min(1),
    nextScheduledAt: isoDateTimeSchema.nullable(),
    /** Null when the automation uses the provider's default. */
    model: agentModelSelectionSchema.nullable(),
    run: automationRunSchema.nullable(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
})

export const updateAutomationSchema = z
    .strictObject({
        revision: automationSchema.shape.revision,
        status: automationSchema.shape.status.optional(),
        schedule: automationScheduleSchema.optional(),
        model: agentModelSelectionSchema.optional(),
    })
    .refine(
        (input) =>
            input.status !== undefined || input.schedule !== undefined || input.model !== undefined,
    )

export type AutomationSchedule = z.infer<typeof automationScheduleSchema>
export type Automation = z.infer<typeof automationSchema>
export type AutomationRun = z.infer<typeof automationRunSchema>
export type UpdateAutomation = z.infer<typeof updateAutomationSchema>
export const parseAutomation = createParser('Automation', automationSchema)
export const parseAutomations = createParser('Automations', z.array(automationSchema))
