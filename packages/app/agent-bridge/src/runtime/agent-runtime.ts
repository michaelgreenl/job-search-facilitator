import type {
    AgentCapability,
    AgentPermissionDecision,
    AgentPermissionRequired,
    StartAgentTaskInput,
} from '@job-search-facilitator/core'

export type AgentRuntimeHealth =
    | { status: 'healthy'; capabilities: AgentCapability[] }
    | { status: 'unavailable'; capabilities: []; error: string }

export interface StartedAgentTask {
    threadId: string
    turnId: string
}

export interface AgentRuntimePermission extends AgentPermissionRequired {
    threadId: string
    turnId: string | null
}

export type AgentRuntimeEvent =
    | { type: 'permission-required'; permission: AgentRuntimePermission }
    | { type: 'permission-resolved'; threadId: string; permissionId: string }
    | {
          type: 'activity'
          threadId: string
          turnId: string
          activity: 'web-search' | 'tool-use' | 'local-read' | 'delegation' | 'plan-update'
      }
    | {
          type: 'reasoning-delta'
          threadId: string
          turnId: string
          itemId: string
          summaryIndex: number
          textDelta: string
      }
    | { type: 'final-message'; threadId: string; turnId: string; text: string }
    | {
          type: 'turn-completed'
          threadId: string
          turnId: string
          status: 'completed' | 'interrupted' | 'failed'
          error: string | null
      }
    | { type: 'runtime-failed'; error: Error }

export interface AgentRuntime {
    readonly health: AgentRuntimeHealth
    startTask(taskId: string, input: StartAgentTaskInput): Promise<StartedAgentTask>
    interruptTask(threadId: string, turnId: string): Promise<void>
    resolvePermission(permissionId: string, decision: AgentPermissionDecision): boolean
    onEvent(listener: (event: AgentRuntimeEvent) => void): () => void
}
