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
    workTaskId: string | null
    workThreadId: string | null
    workTurnId: string | null
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
          workTaskId: string
          workThreadId: string
          workTurnId: string
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
    createdAt: IsoDateTime
    updatedAt: IsoDateTime
}

export type OutreachContactInput = Pick<
    OutreachContact,
    'personName' | 'personTitle' | 'profileUrl' | 'relevanceRationale' | 'draftMessage'
>

export type ContactDiscoveryResult = OutreachContactInput

export interface DraftRevisionResult {
    draftMessage: string
    response: string
}

export type UpdateOutreachContactInput = Pick<OutreachContact, 'messaged'>
