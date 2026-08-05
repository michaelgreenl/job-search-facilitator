export type AgentSessionOwner =
    | { kind: 'job-post-import'; url: string }
    | { kind: 'application-capture'; postId: string }
    | { kind: 'outreach-contact'; postId: string }
    | {
          kind: 'outreach-draft'
          postId: string
          contactId: string
          draft: string
          request: string
      }

export type AgentSession = AgentSessionOwner & { taskId: string }

const agentSessionStorageKey = 'job-search-facilitator:agent-session'

const getSessionStorage = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage)

const isNonBlankString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0

const parseAgentSession = (value: unknown): AgentSession | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }

    const session = value as Record<string, unknown>

    if (!isNonBlankString(session.taskId) || !isNonBlankString(session.kind)) {
        return null
    }

    if (session.kind === 'job-post-import' && isNonBlankString(session.url)) {
        return {
            kind: session.kind,
            taskId: session.taskId,
            url: session.url,
        }
    }

    if (session.kind === 'outreach-contact' && isNonBlankString(session.postId)) {
        return {
            kind: session.kind,
            taskId: session.taskId,
            postId: session.postId,
        }
    }

    if (session.kind === 'application-capture' && isNonBlankString(session.postId)) {
        return {
            kind: session.kind,
            taskId: session.taskId,
            postId: session.postId,
        }
    }

    if (
        session.kind === 'outreach-draft' &&
        isNonBlankString(session.postId) &&
        isNonBlankString(session.contactId) &&
        typeof session.draft === 'string' &&
        isNonBlankString(session.request)
    ) {
        return {
            kind: session.kind,
            taskId: session.taskId,
            postId: session.postId,
            contactId: session.contactId,
            draft: session.draft,
            request: session.request,
        }
    }

    return null
}

const parseStoredSessions = (value: unknown): AgentSession[] | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null
    }

    if ('version' in value && value.version === 1 && 'session' in value) {
        const session = parseAgentSession(value.session)
        return session === null ? null : [session]
    }

    if (!('version' in value) || value.version !== 2 || !('sessions' in value)) {
        return null
    }

    if (!Array.isArray(value.sessions)) {
        return null
    }

    const validSessions = value.sessions
        .map(parseAgentSession)
        .filter((session): session is AgentSession => session !== null)

    if (value.sessions.length > 0 && validSessions.length === 0) {
        return null
    }

    const taskIds = new Set(validSessions.map(({ taskId }) => taskId))
    const importCount = validSessions.filter(({ kind }) => kind === 'job-post-import').length

    return taskIds.size === validSessions.length && importCount <= 1 ? validSessions : null
}

export const readAgentSessions = (): AgentSession[] => {
    const storage = getSessionStorage()

    if (storage === null) {
        return []
    }

    const removeStoredSessions = () => {
        try {
            storage.removeItem(agentSessionStorageKey)
        } catch {
            // Storage may be unavailable even when the browser exposes the API.
        }
    }

    try {
        const stored = storage.getItem(agentSessionStorageKey)

        if (stored === null) {
            return []
        }

        const sessions = parseStoredSessions(JSON.parse(stored))

        if (sessions === null) {
            removeStoredSessions()
            return []
        }

        return sessions
    } catch {
        removeStoredSessions()
        return []
    }
}

export const writeAgentSessions = (sessions: AgentSession[]) => {
    const storage = getSessionStorage()

    if (storage === null) {
        return
    }

    try {
        if (sessions.length === 0) {
            storage.removeItem(agentSessionStorageKey)
        } else {
            storage.setItem(agentSessionStorageKey, JSON.stringify({ version: 2, sessions }))
        }
    } catch {
        // A storage failure must not prevent tasks from remaining usable in memory.
    }
}
