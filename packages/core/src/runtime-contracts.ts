import { z } from 'zod'
import {
    APPLICATION_STATUSES,
    POST_STATUSES,
    USER_LABELS,
    type JobPost,
    type UpdateJobPostResult,
} from './job-post.ts'
import {
    type ContactDiscoveryResult,
    type DraftRevisionResult,
    type OutreachContact,
} from './outreach-contact.ts'
import {
    AGENT_LABELS,
    RESUME_TYPES,
    type JobSearchReport,
    type JobSearchResult,
} from './search-report.ts'
import {
    WORK_CAPABILITIES,
    type JsonObject,
    type WorkActionRequired,
    type WorkHealthResponse,
    type WorkOutputSchema,
    type WorkTask,
    type WorkTaskEvent,
} from './work-task.ts'

export type RuntimeParser<T> = (value: unknown) => T

const WORK_OUTPUT_SCHEMA_DIALECT = 'http://json-schema.org/draft-07/schema#'

const createParser =
    <T>(name: string, schema: z.ZodType<T>): RuntimeParser<T> =>
    (value) => {
        const result = schema.safeParse(value)

        if (!result.success) {
            throw new Error(`${name} did not match its runtime contract`, {
                cause: result.error,
            })
        }

        return result.data
    }

const nonBlankStringSchema = z.string().refine((value) => value.trim().length > 0)
const isoDateTimeSchema = z.iso.datetime({ offset: true })
const httpUrlSchema = z.url().refine((value) => {
    const protocol = new URL(value).protocol

    return protocol === 'http:' || protocol === 'https:'
})
const linkedInProfileUrlSchema = z.url().refine((value) => {
    const url = new URL(value)
    const linkedInHost = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')

    return url.protocol === 'https:' && linkedInHost && url.pathname.startsWith('/in/')
})
const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), z.unknown())

const jobPostSchema: z.ZodType<JobPost> = z.looseObject({
    id: z.uuid(),
    sourceKey: nonBlankStringSchema,
    roleTitle: nonBlankStringSchema,
    company: nonBlankStringSchema,
    location: nonBlankStringSchema.nullable(),
    compensation: nonBlankStringSchema.nullable(),
    techStack: nonBlankStringSchema,
    postSource: nonBlankStringSchema,
    postUrl: httpUrlSchema,
    applicationUrl: httpUrlSchema,
    postStatus: z.enum(POST_STATUSES),
    applicationStatus: z.enum(APPLICATION_STATUSES),
    userLabel: z.enum(USER_LABELS).nullable(),
    archivedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
})

const updateJobPostResultSchema: z.ZodType<UpdateJobPostResult> = z.looseObject({
    post: jobPostSchema,
    inApplyQueue: z.boolean(),
})

const jobSearchResultSchema: z.ZodType<JobSearchResult> = z.looseObject({
    agentRank: z.number().int().positive(),
    agentLabel: z.enum(AGENT_LABELS),
    fitRationale: nonBlankStringSchema,
    applicationFlow: nonBlankStringSchema,
    keyLegitimacySignals: nonBlankStringSchema,
    recommendedResume: z.enum(RESUME_TYPES),
    recommendedAction: nonBlankStringSchema,
    legitimacyNotes: nonBlankStringSchema.nullable(),
    post: jobPostSchema,
})

const jobSearchReportSchema: z.ZodType<JobSearchReport> = z.looseObject({
    id: z.uuid(),
    reportDate: z.iso.date(),
    summary: nonBlankStringSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    archivedAt: isoDateTimeSchema.nullable(),
    results: z.array(jobSearchResultSchema),
})

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

const workTaskIdentity = {
    id: z.uuid(),
    threadId: nonBlankStringSchema,
    turnId: nonBlankStringSchema,
}

const workTaskSchema: z.ZodType<WorkTask> = z.discriminatedUnion('status', [
    z.looseObject({
        ...workTaskIdentity,
        status: z.literal('running'),
        output: z.null(),
        error: z.null(),
    }),
    z.looseObject({
        ...workTaskIdentity,
        status: z.literal('completed'),
        output: jsonObjectSchema,
        error: z.null(),
    }),
    z.looseObject({
        ...workTaskIdentity,
        status: z.literal('failed'),
        output: z.null(),
        error: nonBlankStringSchema,
    }),
    z.looseObject({
        ...workTaskIdentity,
        status: z.literal('cancelled'),
        output: z.null(),
        error: z.null(),
    }),
])

const workActionRequiredSchema: z.ZodType<WorkActionRequired> = z.looseObject({
    id: z.uuid(),
    kind: z.literal('browser-origin'),
    message: nonBlankStringSchema,
    origin: httpUrlSchema,
})

const workTaskEventSchema: z.ZodType<WorkTaskEvent> = z.discriminatedUnion('type', [
    z.looseObject({
        type: z.literal('activity'),
        message: nonBlankStringSchema,
        createdAt: isoDateTimeSchema,
    }),
    z.looseObject({
        type: z.literal('message'),
        textDelta: z.string(),
        startsNewStatement: z.boolean(),
        createdAt: isoDateTimeSchema,
    }),
    z.looseObject({
        type: z.literal('action-required'),
        action: workActionRequiredSchema,
        createdAt: isoDateTimeSchema,
    }),
    z.looseObject({
        type: z.literal('action-resolved'),
        actionId: z.uuid(),
        createdAt: isoDateTimeSchema,
    }),
    z.looseObject({
        type: z.literal('completed'),
        output: jsonObjectSchema,
        createdAt: isoDateTimeSchema,
    }),
    z.looseObject({
        type: z.literal('failed'),
        error: nonBlankStringSchema,
        createdAt: isoDateTimeSchema,
    }),
    z.looseObject({
        type: z.literal('cancelled'),
        createdAt: isoDateTimeSchema,
    }),
])

const workHealthSchema: z.ZodType<WorkHealthResponse> = z.looseObject({
    status: z.literal('healthy'),
    capabilities: z.array(z.enum(WORK_CAPABILITIES)),
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

const toWorkOutputSchema = (schema: z.ZodType): WorkOutputSchema => {
    const { $schema, ...jsonSchema } = z.toJSONSchema(schema, {
        target: 'draft-07',
        io: 'input',
    })

    if (
        jsonSchema.type !== 'object' ||
        $schema !== WORK_OUTPUT_SCHEMA_DIALECT ||
        jsonSchema.$async === true
    ) {
        throw new Error('Could not create a supported Work output schema')
    }

    return jsonSchema as WorkOutputSchema
}

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
export const parseJobPost = createParser('Job post', jobPostSchema)
export const parseJobPosts = createParser('Job posts', z.array(jobPostSchema))
export const parseUpdateJobPostResult = createParser(
    'Job post update result',
    updateJobPostResultSchema,
)
export const parseJobSearchReport = createParser('Job search report', jobSearchReportSchema)
export const parseJobSearchReports = createParser(
    'Job search reports',
    z.array(jobSearchReportSchema),
)
export const parseOutreachContact = createParser('Outreach contact', outreachContactSchema)
export const parseOutreachContacts = createParser(
    'Outreach contacts',
    z.array(outreachContactSchema),
)
export const parseWorkHealth = createParser('Work health', workHealthSchema)
export const parseWorkTask = createParser('Work task', workTaskSchema)
export const parseWorkTaskEvent = createParser('Work task event', workTaskEventSchema)
