import { z } from 'zod'

type JsonObject = { [key: string]: unknown }

export const rpcIdSchema = z.union([z.string(), z.number().int()])
export type RpcId = z.infer<typeof rpcIdSchema>

export const rpcErrorSchema = z.object({ code: z.number().int(), message: z.string() })
export const emptyResponseSchema = z.object({})

export const pluginInstalledResponseSchema = z.object({
    marketplaces: z.array(
        z.object({
            plugins: z.array(
                z.object({
                    id: z.string(),
                    installed: z.boolean(),
                    enabled: z.boolean(),
                    availability: z.string(),
                    source: z.object({
                        type: z.string(),
                        path: z.string().min(1).nullable().optional(),
                    }),
                }),
            ),
        }),
    ),
})

export const threadStartResponseSchema = z.object({
    thread: z.object({ id: z.string().min(1) }),
})

export const turnStartResponseSchema = z.object({
    turn: z.object({ id: z.string().min(1) }),
})

export const turnReferenceSchema = z.object({
    threadId: z.string().min(1),
    turnId: z.string().min(1),
})

export const permissionResolvedSchema = z.object({
    threadId: z.string().min(1),
    requestId: rpcIdSchema,
})

export const itemStartedSchema = turnReferenceSchema.extend({
    item: z.object({ type: z.string() }),
})

export const reasoningDeltaSchema = turnReferenceSchema.extend({
    itemId: z.string().min(1),
    summaryIndex: z.number().int().nonnegative(),
    delta: z.string(),
})

export const itemCompletedSchema = turnReferenceSchema.extend({
    item: z.object({
        type: z.string(),
        phase: z.string().nullable().optional(),
        text: z.string().optional(),
    }),
})

export const turnCompletedSchema = z.object({
    threadId: z.string().min(1),
    turn: z.object({
        id: z.string().min(1),
        status: z.enum(['completed', 'interrupted', 'failed']),
        error: z.object({ message: z.string() }).nullable().optional(),
    }),
})

export const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
