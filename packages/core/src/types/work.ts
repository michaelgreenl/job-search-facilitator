import type { IsoDateTime } from './jobs.ts'

export const WORK_CAPABILITIES = ['chrome'] as const

export type WorkCapability = (typeof WORK_CAPABILITIES)[number]

export type JsonObject = Record<string, unknown>

/**
 * Work output uses the bridge's synchronous JSON Schema draft-07 subset with
 * an object at its root. Dialect markers and format keywords are unsupported.
 */
export type WorkOutputSchema = {
    [keyword: string]: unknown
    type: 'object'
    $async?: false
    $schema?: never
}

export type WorkActionDecision = 'approve' | 'decline'

export interface WorkActionRequired {
    id: string
    kind: 'browser-origin'
    message: string
    origin: string
}

export interface StartWorkTaskInput {
    prompt: string
    outputSchema: WorkOutputSchema
    capabilities: WorkCapability[]
}

export interface WorkHealthResponse {
    status: 'healthy'
    capabilities: WorkCapability[]
}

interface WorkTaskIdentity {
    id: string
    threadId: string
    turnId: string
}

export type WorkTask = WorkTaskIdentity &
    (
        | { status: 'running'; output: null; error: null }
        | { status: 'completed'; output: JsonObject; error: null }
        | { status: 'failed'; output: null; error: string }
        | { status: 'cancelled'; output: null; error: null }
    )

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
