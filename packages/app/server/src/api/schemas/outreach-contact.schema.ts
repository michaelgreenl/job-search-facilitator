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
