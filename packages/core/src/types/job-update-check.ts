import type { ApplicationStatus, IsoDateTime } from './jobs.ts'

export const JOB_UPDATE_SOURCES = ['gmail', 'linkedin'] as const

export type JobUpdateSource = (typeof JOB_UPDATE_SOURCES)[number]
export type ActiveApplicationStatus = Extract<
    ApplicationStatus,
    'awaiting-response' | 'interviewing'
>
export type ObservedApplicationStatus = Exclude<ApplicationStatus, 'not-applied'>

export interface JobUpdateCheckContext {
    posts: Array<{
        id: string
        company: string
        roleTitle: string
        postUrl: string
        application: {
            status: ActiveApplicationStatus
            url: string
            appliedAt: IsoDateTime
        } | null
        contacts: Array<{
            id: string
            personName: string
            personTitle: string
            profileUrl: string
            messagedAt: IsoDateTime
        }>
    }>
}

interface JobUpdateEvidence {
    jobPostId: string
    source: JobUpdateSource
    externalId: string
    summary: string
    sourceUrl: string | null
    occurredAt: IsoDateTime
}

export type JobUpdate =
    | (JobUpdateEvidence & {
          kind: 'application-status'
          source: 'gmail'
          status: ObservedApplicationStatus
      })
    | (JobUpdateEvidence & {
          kind: 'outreach-response'
          outreachContactId: string
      })
    | (JobUpdateEvidence & {
          kind: 'review-needed'
          outreachContactId: string | null
      })

export interface JobUpdateCheckResult {
    warnings: string[]
    updates: JobUpdate[]
}

export interface SavedJobUpdates {
    createdActivities: number
}
