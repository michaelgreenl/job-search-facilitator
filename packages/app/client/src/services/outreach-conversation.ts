import { readSessionStorage, writeSessionStorage } from './session-storage'

export interface DraftExchange {
    taskId: string
    request: string
    response: string
    draft: string | null
}

export interface DraftConversation {
    postId: string
    contactId: string
    threadId: string | null
    draft: string
    request: string
    exchanges: DraftExchange[]
}

const storageKey = 'job-search-facilitator:outreach-conversations'
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

export function readDraftConversations(): Record<string, DraftConversation> {
    try {
        const stored: unknown = JSON.parse(readSessionStorage(storageKey) ?? '{}')

        if (!isRecord(stored)) {
            return {}
        }

        return Object.fromEntries(
            Object.entries(stored).filter(
                ([id, value]) =>
                    isRecord(value) &&
                    value.contactId === id &&
                    typeof value.postId === 'string' &&
                    (value.threadId === null || typeof value.threadId === 'string') &&
                    typeof value.draft === 'string' &&
                    typeof value.request === 'string' &&
                    Array.isArray(value.exchanges) &&
                    value.exchanges.every(
                        (entry: unknown) =>
                            isRecord(entry) &&
                            typeof entry.taskId === 'string' &&
                            typeof entry.request === 'string' &&
                            typeof entry.response === 'string' &&
                            (entry.draft === null || typeof entry.draft === 'string'),
                    ),
            ),
        ) as Record<string, DraftConversation>
    } catch {
        return {}
    }
}

export function writeDraftConversations(conversations: Record<string, DraftConversation>) {
    writeSessionStorage(storageKey, JSON.stringify(conversations))
}
