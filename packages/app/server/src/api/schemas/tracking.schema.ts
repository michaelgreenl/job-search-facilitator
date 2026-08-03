import { z } from 'zod'

const nonBlankString = z.string().trim().min(1)
const dateTime = z.iso.datetime({ offset: true })

export const trackingJobPostParamsSchema = z.strictObject({ jobPostId: z.uuid() })

export const saveNextStepInputSchema = z.strictObject({
    title: nonBlankString,
    dueAt: dateTime,
    completedAt: dateTime.nullable(),
})
