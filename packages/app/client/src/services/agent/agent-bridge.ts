import {
    parseAgentHealth,
    parseAgentTask,
    parseAgentTaskEvent,
    type AgentPermissionDecision,
    type AgentTaskEvent,
    type StartAgentTaskInput,
} from '@job-search-facilitator/core'
import { parseJsonResponse, readResponseError } from '@/api'

const agentBridgeUrl = (import.meta.env.VITE_AGENT_BRIDGE_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
)

export class AgentBridgeRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message)
    }
}

async function requestAgentBridge(path: string, init?: RequestInit) {
    const response = await fetch(`${agentBridgeUrl}${path}`, init)

    if (!response.ok) {
        throw new AgentBridgeRequestError(
            (await readResponseError(response)) ?? `Agent request failed (${response.status})`,
            response.status,
        )
    }

    return response
}

export async function fetchAgentHealth() {
    const path = '/health'
    const response = await requestAgentBridge(path)

    return parseJsonResponse(response, parseAgentHealth, `Agent ${path}`)
}

export async function startAgentTask(taskId: string, input: StartAgentTaskInput) {
    const path = `/tasks/${encodeURIComponent(taskId)}`
    const response = await requestAgentBridge(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

    return parseJsonResponse(response, parseAgentTask, `Agent ${path}`)
}

export async function fetchAgentTask(taskId: string) {
    const path = `/tasks/${encodeURIComponent(taskId)}`
    const response = await requestAgentBridge(path)

    return parseJsonResponse(response, parseAgentTask, `Agent ${path}`)
}

export async function cancelAgentTask(taskId: string) {
    const path = `/tasks/${encodeURIComponent(taskId)}/cancel`
    const response = await requestAgentBridge(path, { method: 'POST' })

    return parseJsonResponse(response, parseAgentTask, `Agent ${path}`)
}

export async function resolveAgentPermission(
    taskId: string,
    permissionId: string,
    decision: AgentPermissionDecision,
) {
    await requestAgentBridge(`/tasks/${taskId}/permissions/${permissionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
    })
}

export interface AgentTaskConnection {
    close: () => void
}

interface AgentTaskConnectionHandlers {
    onOpen: () => void
    onEvent: (event: AgentTaskEvent) => void
    onInvalidEvent: () => void
    onDisconnected: () => void
    onReconnecting: () => void
}

export function connectAgentTask(
    taskId: string,
    handlers: AgentTaskConnectionHandlers,
): AgentTaskConnection {
    const source = new EventSource(`${agentBridgeUrl}/tasks/${encodeURIComponent(taskId)}/events`)

    source.onopen = handlers.onOpen
    source.onmessage = ({ data }) => {
        try {
            if (typeof data !== 'string') {
                throw new Error()
            }

            const value: unknown = JSON.parse(data)
            handlers.onEvent(parseAgentTaskEvent(value))
        } catch {
            handlers.onInvalidEvent()
        }
    }
    source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) {
            handlers.onDisconnected()
        } else {
            handlers.onReconnecting()
        }
    }

    return {
        close: () => source.close(),
    }
}
