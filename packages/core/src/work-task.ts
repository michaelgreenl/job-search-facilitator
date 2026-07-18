import type { IsoDateTime } from './job-post.ts'

export const WORK_CAPABILITIES = ['chrome'] as const

export type WorkCapability = (typeof WORK_CAPABILITIES)[number]

export type JsonObject = Record<string, unknown>

export interface StartWorkTaskInput {
    prompt: string
    outputSchema: JsonObject
    capabilities: WorkCapability[]
}

export interface WorkTask {
    id: string
    status: 'running' | 'completed' | 'failed'
    threadId: string
    turnId: string
    output: JsonObject | null
    error: string | null
}

export type WorkTaskEvent =
    | { type: 'activity'; message: string; createdAt: IsoDateTime }
    | { type: 'message'; textDelta: string; createdAt: IsoDateTime }
    | { type: 'completed'; output: JsonObject; createdAt: IsoDateTime }
    | { type: 'failed'; error: string; createdAt: IsoDateTime }
