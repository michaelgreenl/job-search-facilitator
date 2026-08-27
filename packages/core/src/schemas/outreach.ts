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
    email: z.email().nullable(),
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
const emailAgentOutputSchema = z
    .string()
    .regex(
        /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/,
    )
const contactDiscoveryContactWireSchema = z.strictObject({
    personName: agentOutputTextSchema,
    personTitle: agentOutputTextSchema,
    profileUrl: linkedInAgentOutputSchema,
    email: emailAgentOutputSchema.nullable(),
    relevanceRationale: agentOutputTextSchema,
    draftMessage: agentOutputTextSchema,
})
const contactDiscoveryWireSchema = z.strictObject({
    outcome: z.enum(['contact', 'failed']),
    contact: contactDiscoveryContactWireSchema.nullable(),
    error: agentOutputTextSchema.nullable(),
})
const draftRevisionWireSchema = z.strictObject({
    draftMessage: agentOutputTextSchema,
    response: agentOutputTextSchema,
})

const contactDiscoveryResultSchema: z.ZodType<ContactDiscoveryResult> =
    contactDiscoveryWireSchema.transform((result, context): ContactDiscoveryResult => {
        if (result.outcome === 'failed' && result.contact === null && result.error !== null) {
            return { outcome: result.outcome, contact: null, error: result.error.trim() }
        }

        if (result.outcome === 'contact' && result.contact !== null && result.error === null) {
            return {
                outcome: result.outcome,
                contact: {
                    personName: result.contact.personName.trim(),
                    personTitle: result.contact.personTitle.trim(),
                    profileUrl: result.contact.profileUrl.trim(),
                    email: result.contact.email,
                    relevanceRationale: result.contact.relevanceRationale.trim(),
                    draftMessage: result.contact.draftMessage.trim(),
                },
                error: null,
            }
        }

        context.addIssue({ code: 'custom', message: 'Discovery outcome is inconsistent' })
        return z.NEVER
    })

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
