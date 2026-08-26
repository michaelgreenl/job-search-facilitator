import type { IsoDateTime } from './jobs.ts'

export const AGENT_CAPABILITIES = ['chrome'] as const

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number]

export type JsonObject = Record<string, unknown>

/**
 * Agent output uses the bridge's synchronous JSON Schema draft-07 subset with
 * an object at its root. Dialect markers and format keywords are unsupported.
 */
export type AgentOutputSchema = {
    [keyword: string]: unknown
    type: 'object'
    $async?: false
    $schema?: never
}

export type AgentPermissionDecision = 'approve' | 'decline'

export interface AgentPermissionRequired {
    id: string
    kind: 'browser-origin'
    message: string
    origin: string
}

export interface StartAgentTaskInput {
    prompt: string
    outputSchema: AgentOutputSchema
    capabilities: AgentCapability[]
    webSearch?: boolean
}

export interface AgentHealthResponse {
    status: 'healthy'
    capabilities: AgentCapability[]
}

interface AgentTaskIdentity {
    id: string
    threadId: string
    turnId: string
}

export type AgentTask = AgentTaskIdentity &
    (
        | { status: 'running'; output: null; error: null }
        | { status: 'completed'; output: JsonObject; error: null }
        | { status: 'failed'; output: null; error: string }
        | { status: 'cancelled'; output: null; error: null }
    )

export type AgentTaskEvent =
    | { type: 'activity'; message: string; createdAt: IsoDateTime }
    | {
          type: 'message'
          textDelta: string
          startsNewStatement: boolean
          createdAt: IsoDateTime
      }
    | {
          type: 'permission-required'
          permission: AgentPermissionRequired
          createdAt: IsoDateTime
      }
    | { type: 'permission-resolved'; permissionId: string; createdAt: IsoDateTime }
    | { type: 'completed'; output: JsonObject; createdAt: IsoDateTime }
    | { type: 'failed'; error: string; createdAt: IsoDateTime }
    | { type: 'cancelled'; createdAt: IsoDateTime }
