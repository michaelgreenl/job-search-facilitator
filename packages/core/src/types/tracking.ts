import type { ApplicationStatus, IsoDateTime } from './jobs.ts'

export const TRACKING_ACTIVITY_SOURCES = ['manual', 'gmail', 'linkedin', 'system'] as const

export const TRACKING_ACTIVITY_TYPES = [
    'application-submitted',
    'application-acknowledged',
    'application-status-changed',
    'interview-requested',
    'interview-scheduled',
    'rejection-received',
    'offer-received',
    'outreach-sent',
    'outreach-response-received',
    'action-requested',
] as const

export type TrackingActivityType = (typeof TRACKING_ACTIVITY_TYPES)[number]

export type TrackingActivitySource = (typeof TRACKING_ACTIVITY_SOURCES)[number]

export interface JobPostSnapshot {
    jobPostId: string
    description: string
    sourceUrl: string
    capturedAt: IsoDateTime
    createdAt: IsoDateTime
}

export type CreateJobPostSnapshotInput = Pick<
    JobPostSnapshot,
    'description' | 'sourceUrl' | 'capturedAt'
>

export type ApplicationArtifactMediaType = 'application/pdf' | `image/${string}`

export interface ApplicationArtifact {
    id: string
    jobPostId: string
    storageKey: string
    fileName: string
    mediaType: ApplicationArtifactMediaType
    label: string | null
    position: number
    capturedAt: IsoDateTime
    createdAt: IsoDateTime
}

export type CreateApplicationArtifactInput = Pick<
    ApplicationArtifact,
    'storageKey' | 'fileName' | 'mediaType' | 'label' | 'position' | 'capturedAt'
>

export interface TrackingActivity {
    id: string
    jobPostId: string
    outreachContactId: string | null
    type: TrackingActivityType
    applicationStatus: ApplicationStatus | null
    source: TrackingActivitySource
    externalId: string | null
    summary: string
    sourceUrl: string | null
    occurredAt: IsoDateTime
    createdAt: IsoDateTime
}

export type CreateTrackingActivityInput = Pick<
    TrackingActivity,
    | 'outreachContactId'
    | 'type'
    | 'applicationStatus'
    | 'source'
    | 'externalId'
    | 'summary'
    | 'sourceUrl'
    | 'occurredAt'
>

export interface JobNextStep {
    jobPostId: string
    title: string
    dueAt: IsoDateTime
    completedAt: IsoDateTime | null
    sourceActivityId: string | null
    createdAt: IsoDateTime
    updatedAt: IsoDateTime
}

export type SaveJobNextStepInput = Pick<
    JobNextStep,
    'title' | 'dueAt' | 'completedAt' | 'sourceActivityId'
>
