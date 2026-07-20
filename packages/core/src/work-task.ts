import type { IsoDateTime } from './job-post.ts'

export const WORK_CAPABILITIES = ['chrome'] as const

export type WorkCapability = (typeof WORK_CAPABILITIES)[number]

export type JsonObject = Record<string, unknown>

export type WorkActionDecision = 'approve' | 'decline'

export interface WorkActionRequired {
    id: string
    kind: 'browser-origin'
    message: string
    origin: string
}

export interface StartWorkTaskInput {
    prompt: string
    outputSchema: JsonObject
    capabilities: WorkCapability[]
}

export interface WorkTask {
    id: string
    status: 'running' | 'completed' | 'failed' | 'cancelled'
    threadId: string
    turnId: string
    output: JsonObject | null
    error: string | null
}

export type WorkTaskEvent =
    | { type: 'activity'; message: string; createdAt: IsoDateTime }
    | {
          type: 'message'
          textDelta: string
          startsNewStatement: boolean
          createdAt: IsoDateTime
      }
    | { type: 'action-required'; action: WorkActionRequired; createdAt: IsoDateTime }
    | { type: 'action-resolved'; actionId: string; createdAt: IsoDateTime }
    | { type: 'completed'; output: JsonObject; createdAt: IsoDateTime }
    | { type: 'failed'; error: string; createdAt: IsoDateTime }
    | { type: 'cancelled'; createdAt: IsoDateTime }
