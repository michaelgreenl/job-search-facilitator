import type { IsoDateTime } from './job-post.ts'

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
