import { z } from 'zod'
import type {
    ContactDiscoveryResult,
    DraftRevisionResult,
    OutreachContact,
} from '../types/outreach.ts'
import type { WorkOutputSchema } from '../types/work.ts'
import {
    createParser,
    isoDateTimeSchema,
    linkedInProfileUrlSchema,
    nonBlankStringSchema,
    toWorkOutputSchema,
} from './shared.ts'

const outreachContactSchema: z.ZodType<OutreachContact> = z.looseObject({
    id: z.uuid(),
    jobPostId: z.uuid(),
    personName: nonBlankStringSchema,
    personTitle: nonBlankStringSchema,
    profileUrl: linkedInProfileUrlSchema,
    relevanceRationale: nonBlankStringSchema,
    draftMessage: nonBlankStringSchema,
    messaged: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
})

const workOutputTextSchema = z.string().regex(/\S/)
const linkedInWorkOutputSchema = z
    .string()
    .regex(/^\s*https:\/\/(?:[^./\s]+\.)*linkedin\.com\/in\/\S+\s*$/)
const contactDiscoveryWireSchema = z.strictObject({
    personName: workOutputTextSchema,
    personTitle: workOutputTextSchema,
    profileUrl: linkedInWorkOutputSchema,
    relevanceRationale: workOutputTextSchema,
    draftMessage: workOutputTextSchema,
})
const draftRevisionWireSchema = z.strictObject({
    draftMessage: workOutputTextSchema,
    response: workOutputTextSchema,
})

const contactDiscoveryResultSchema: z.ZodType<ContactDiscoveryResult> =
    contactDiscoveryWireSchema.transform((result) => ({
        personName: result.personName.trim(),
        personTitle: result.personTitle.trim(),
        profileUrl: result.profileUrl.trim(),
        relevanceRationale: result.relevanceRationale.trim(),
        draftMessage: result.draftMessage.trim(),
    }))

const draftRevisionResultSchema: z.ZodType<DraftRevisionResult> = draftRevisionWireSchema.transform(
    (result) => ({
        draftMessage: result.draftMessage.trim(),
        response: result.response.trim(),
    }),
)

const contactDiscoveryOutputSchema = toWorkOutputSchema(contactDiscoveryWireSchema)
const draftRevisionOutputSchema = toWorkOutputSchema(draftRevisionWireSchema)

export const createContactDiscoveryOutputSchema = (): WorkOutputSchema =>
    structuredClone(contactDiscoveryOutputSchema)

export const createDraftRevisionOutputSchema = (): WorkOutputSchema =>
    structuredClone(draftRevisionOutputSchema)

export const parseContactDiscoveryResult = createParser(
    'Contact discovery result',
    contactDiscoveryResultSchema,
)
export const parseDraftRevisionResult = createParser(
    'Draft revision result',
    draftRevisionResultSchema,
)
export const parseOutreachContact = createParser('Outreach contact', outreachContactSchema)
export const parseOutreachContacts = createParser(
    'Outreach contacts',
    z.array(outreachContactSchema),
)
