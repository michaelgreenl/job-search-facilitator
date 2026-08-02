import { z } from 'zod'
import {
    AGENT_CAPABILITIES,
    type AgentPermissionRequired,
    type AgentHealthResponse,
    type AgentTask,
    type AgentTaskEvent,
} from '../types/agent.ts'
import {
    createParser,
    httpUrlSchema,
    isoDateTimeSchema,
    jsonObjectSchema,
    nonBlankStringSchema,
} from './shared.ts'

const agentTaskIdentity = {
    id: z.uuid(),
    threadId: nonBlankStringSchema,
    turnId: nonBlankStringSchema,
}

const agentTaskSchema: z.ZodType<AgentTask> = z.discriminatedUnion('status', [
    z.looseObject({
        ...agentTaskIdentity,
        status: z.literal('running'),
        output: z.null(),
        error: z.null(),
    }),
    z.looseObject({
        ...agentTaskIdentity,
        status: z.literal('completed'),
        output: jsonObjectSchema,
        error: z.null(),
    }),
    z.looseObject({
        ...agentTaskIdentity,
        status: z.literal('failed'),
        output: z.null(),
        error: nonBlankStringSchema,
    }),
    z.looseObject({
        ...agentTaskIdentity,
        status: z.literal('cancelled'),
        output: z.null(),
        error: z.null(),
    }),
])

const agentPermissionRequiredSchema: z.ZodType<AgentPermissionRequired> = z.looseObject({
    id: z.uuid(),
    kind: z.literal('browser-origin'),
    message: nonBlankStringSchema,
    origin: httpUrlSchema,
})

const agentTaskEventSchema: z.ZodType<AgentTaskEvent> = z.discriminatedUnion('type', [
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
        type: z.literal('permission-required'),
        permission: agentPermissionRequiredSchema,
        createdAt: isoDateTimeSchema,
    }),
    z.looseObject({
        type: z.literal('permission-resolved'),
        permissionId: z.uuid(),
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

const agentHealthSchema: z.ZodType<AgentHealthResponse> = z.looseObject({
    status: z.literal('healthy'),
    capabilities: z.array(z.enum(AGENT_CAPABILITIES)),
})

export const parseAgentHealth = createParser('Agent health', agentHealthSchema)
export const parseAgentTask = createParser('Agent task', agentTaskSchema)
export const parseAgentTaskEvent = createParser('Agent task event', agentTaskEventSchema)
