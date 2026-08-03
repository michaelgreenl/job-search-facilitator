import { z } from 'zod'
import type {
    ContactDiscoveryResult,
    DraftRevisionResult,
    OutreachContact,
} from '../types/outreach.ts'
import type { AgentOutputSchema } from '../types/agent.ts'
import {
    createParser,
    isoDateTimeSchema,
    linkedInProfileUrlSchema,
    nonBlankStringSchema,
    toAgentOutputSchema,
} from './shared.ts'

export const outreachContactSchema: z.ZodType<OutreachContact> = z.looseObject({
    id: z.uuid(),
    jobPostId: z.uuid(),
    personName: nonBlankStringSchema,
    personTitle: nonBlankStringSchema,
    profileUrl: linkedInProfileUrlSchema,
    relevanceRationale: nonBlankStringSchema,
    draftMessage: nonBlankStringSchema,
    messaged: z.boolean(),
    messagedAt: isoDateTimeSchema.nullable(),
    respondedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
})

const agentOutputTextSchema = z.string().regex(/\S/)
const linkedInAgentOutputSchema = z
    .string()
    .regex(/^\s*https:\/\/(?:[^./\s]+\.)*linkedin\.com\/in\/\S+\s*$/)
const contactDiscoveryWireSchema = z.strictObject({
    personName: agentOutputTextSchema,
    personTitle: agentOutputTextSchema,
    profileUrl: linkedInAgentOutputSchema,
    relevanceRationale: agentOutputTextSchema,
    draftMessage: agentOutputTextSchema,
})
const draftRevisionWireSchema = z.strictObject({
    draftMessage: agentOutputTextSchema,
    response: agentOutputTextSchema,
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

const contactDiscoveryOutputSchema = toAgentOutputSchema(contactDiscoveryWireSchema)
const draftRevisionOutputSchema = toAgentOutputSchema(draftRevisionWireSchema)

export const createContactDiscoveryOutputSchema = (): AgentOutputSchema =>
    structuredClone(contactDiscoveryOutputSchema)

export const createDraftRevisionOutputSchema = (): AgentOutputSchema =>
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
