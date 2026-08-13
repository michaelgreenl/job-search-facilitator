import type { IsoDateTime } from './jobs.ts'

export const OUTREACH_RUN_STATUSES = ['pending', 'running', 'completed', 'failed'] as const

export const OUTREACH_CONTACT_COUNTS = [2, 3] as const

export type OutreachRunStatus = (typeof OUTREACH_RUN_STATUSES)[number]

export type OutreachContactCount = (typeof OUTREACH_CONTACT_COUNTS)[number]

export interface OutreachRun {
    id: string
    jobPostId: string
    requestedContactCount: OutreachContactCount
    status: OutreachRunStatus
    agentTaskId: string | null
    agentThreadId: string | null
    agentTurnId: string | null
    error: string | null
    completedAt: IsoDateTime | null
    createdAt: IsoDateTime
    updatedAt: IsoDateTime
}

export interface CreateOutreachRunInput {
    jobPostId: string
    requestedContactCount: OutreachContactCount
}

export type UpdateOutreachRunInput =
    | {
          status: 'running'
          agentTaskId: string
          agentThreadId: string
          agentTurnId: string
      }
    | {
          status: 'completed'
      }
    | {
          status: 'failed'
          error: string
      }

export interface OutreachContact {
    id: string
    jobPostId: string
    personName: string
    personTitle: string
    profileUrl: string
    relevanceRationale: string
    draftMessage: string
    messaged: boolean
    messagedAt: IsoDateTime | null
    respondedAt: IsoDateTime | null
    createdAt: IsoDateTime
    updatedAt: IsoDateTime
}

export type OutreachContactInput = Pick<
    OutreachContact,
    'personName' | 'personTitle' | 'profileUrl' | 'relevanceRationale' | 'draftMessage'
>

export type ContactDiscoveryResult =
    | { outcome: 'contact'; contact: OutreachContactInput; error: null }
    | { outcome: 'failed'; contact: null; error: string }

export interface DraftRevisionResult {
    draftMessage: string
    response: string
}

export interface UpdateOutreachContactInput {
    draftMessage?: string
    messaged?: boolean
    responded?: boolean
}
