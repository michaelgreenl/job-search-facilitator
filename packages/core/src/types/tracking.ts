import type { ApplicationStatus, IsoDateTime, JobPost } from './jobs.ts'
import type { OutreachContact } from './outreach.ts'

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

export type TrackingOutreachStatus = 'response-pending' | 'responded'

export type TrackedOutreachContact = OutreachContact & {
    status: TrackingOutreachStatus
}

export interface TrackedJobPost {
    post: JobPost
    contacts: TrackedOutreachContact[]
    snapshot: JobPostSnapshot | null
    applicationArtifacts: ApplicationArtifact[]
    activities: TrackingActivity[]
    nextStep: JobNextStep | null
}

export const TRACKING_AUTOMATION_SOURCES = ['gmail', 'linkedin'] as const

export type TrackingAutomationSource = (typeof TRACKING_AUTOMATION_SOURCES)[number]

export interface TrackingAutomationContactContext {
    id: string
    personName: string
    personTitle: string
    profileUrl: string
    messagedAt: IsoDateTime
    status: TrackingOutreachStatus
}

export interface TrackingAutomationPostContext {
    id: string
    company: string
    roleTitle: string
    postUrl: string
    applicationUrl: string
    applicationStatus: ApplicationStatus
    eligibleSince: IsoDateTime
    lastObservedAt: Record<TrackingAutomationSource, IsoDateTime | null>
    contacts: TrackingAutomationContactContext[]
}

export interface TrackingAutomationContext {
    requestedAt: IsoDateTime
    posts: TrackingAutomationPostContext[]
}

export interface TrackingAutomationObservation {
    jobPostId: string
    outreachContactId: string | null
    type: TrackingActivityType
    applicationStatus: ApplicationStatus | null
    source: TrackingAutomationSource
    externalId: string
    summary: string
    sourceUrl: string | null
    occurredAt: IsoDateTime
}

export interface TrackingAutomationNextStep {
    jobPostId: string
    title: string
    dueAt: IsoDateTime
    source: Pick<TrackingAutomationObservation, 'source' | 'externalId' | 'type'> | null
}

export interface TrackingAutomationResult {
    sourceErrors: Record<TrackingAutomationSource, string | null>
    observations: TrackingAutomationObservation[]
    nextSteps: TrackingAutomationNextStep[]
}

export interface ApplyTrackingAutomationResult {
    createdActivities: number
}
