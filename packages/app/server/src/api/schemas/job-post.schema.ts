import { APPLICATION_STATUSES, POST_STATUSES, USER_LABELS } from '@job-search-facilitator/core'
import { z } from 'zod'

export { createUserAddedJobPostInputSchema } from '@job-search-facilitator/core'

export const jobPostIdParamsSchema = z.strictObject({
    id: z.uuid(),
})

export const updateJobPostInputSchema = z
    .strictObject({
        applicationStatus: z.enum(APPLICATION_STATUSES).optional(),
        postStatus: z.enum(POST_STATUSES).optional(),
        userLabel: z.enum(USER_LABELS).nullable().optional(),
        archivedAt: z.iso.datetime({ offset: true }).nullable().optional(),
    })
    .refine((input) => Object.keys(input).length > 0, {
        message: 'At least one field is required',
    })
