import { z } from 'zod'
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

const automationSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(['ACTIVE', 'PAUSED']),
    schedule: automationScheduleSchema.nullable(),
    timeZone: z.string().min(1),
    nextScheduledAt: isoDateTimeSchema.nullable(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
})

export const updateAutomationSchema = z
    .strictObject({
        revision: automationSchema.shape.revision,
        status: automationSchema.shape.status.optional(),
        schedule: automationScheduleSchema.optional(),
    })
    .refine((input) => input.status !== undefined || input.schedule !== undefined)

export type AutomationSchedule = z.infer<typeof automationScheduleSchema>
export type Automation = z.infer<typeof automationSchema>
export type UpdateAutomation = z.infer<typeof updateAutomationSchema>
export const parseAutomation = createParser('Automation', automationSchema)
export const parseAutomations = createParser('Automations', z.array(automationSchema))
