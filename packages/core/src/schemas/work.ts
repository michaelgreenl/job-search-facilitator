import { z } from 'zod'
import {
    WORK_CAPABILITIES,
    type WorkActionRequired,
    type WorkHealthResponse,
    type WorkTask,
    type WorkTaskEvent,
} from '../types/work.ts'
import {
    createParser,
    httpUrlSchema,
    isoDateTimeSchema,
    jsonObjectSchema,
    nonBlankStringSchema,
} from './shared.ts'

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

export const parseWorkHealth = createParser('Work health', workHealthSchema)
export const parseWorkTask = createParser('Work task', workTaskSchema)
export const parseWorkTaskEvent = createParser('Work task event', workTaskEventSchema)
