import type { ApplicationArtifact } from './applications.ts'

export const MAX_JSON_REQUEST_BYTES = 1024 * 1024

export const APPLICATION_STATUSES = [
    'not-applied',
    'awaiting-response',
    'interviewing',
    'rejected',
    'hired',
] as const

export const POST_STATUSES = ['unknown', 'active', 'closed'] as const

export const USER_LABELS = ['P1', 'P2', 'quick-app', 'forgo'] as const

export const AGENT_LABELS = ['target', 'quick-app'] as const

export const RESUME_TYPES = ['frontend', 'backend-full-stack', 'general'] as const

export type IsoDateTime = string

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export type PostStatus = (typeof POST_STATUSES)[number]

export type UserLabel = (typeof USER_LABELS)[number]

export type AgentLabel = (typeof AGENT_LABELS)[number]

export type ResumeType = (typeof RESUME_TYPES)[number]

export interface JobPost {
    id: string
    sourceKey: string
    roleTitle: string
    company: string
    location: string | null
    compensation: string | null
    techStack: string
    postSource: string
    postUrl: string
    applicationUrl: string
    postStatus: PostStatus
    applicationStatus: ApplicationStatus
    appliedAt: IsoDateTime | null
    userLabel: UserLabel | null
    archivedAt: IsoDateTime | null
    createdAt: IsoDateTime
    updatedAt: IsoDateTime
}

export interface JobPostSnapshot {
    description: string
    sourceUrl: string
    capturedAt: IsoDateTime
}

export interface JobPostInput {
    sourceKey: string
    description: string
    roleTitle: string
    company: string
    location: string | null
    compensation: string | null
    techStack: string
    postSource: string
    postUrl: string
    applicationUrl: string
    postStatus: PostStatus
}

export interface UpdateJobPostInput {
    applicationStatus?: ApplicationStatus
    postStatus?: PostStatus
    userLabel?: UserLabel | null
    archivedAt?: IsoDateTime | null
}

export interface UpdateJobPostResult {
    post: JobPost
    inApplyQueue: boolean
}

export interface JobSearchReport {
    id: string
    reportDate: string
    summary: string
    createdAt: IsoDateTime
    updatedAt: IsoDateTime
    archivedAt: IsoDateTime | null
    results: JobSearchResult[]
}

export interface JobRecommendation {
    agentRank: number
    agentLabel: AgentLabel
    fitRationale: string
    applicationFlow: string
    keyLegitimacySignals: string
    recommendedResume: ResumeType
    recommendedAction: string
    legitimacyNotes: string | null
}

export interface JobRecommendationContext extends JobRecommendation {
    reportId: string
    reportDate: string
}

export interface JobSearchResult extends JobRecommendation {
    post: JobPost
    jobPostSnapshot: JobPostSnapshot | null
}

export interface JobSearchResultInput extends JobRecommendation {
    post: JobPostInput
}

export interface UpsertJobSearchReportInput {
    summary: string
    results: JobSearchResultInput[]
}

export type StandaloneJobRecommendation = Omit<JobRecommendation, 'agentRank'>

export type CreateUserAddedJobPostInput = StandaloneJobRecommendation & {
    post: JobPostInput
}

export type UserAddedJobPost = StandaloneJobRecommendation & {
    post: JobPost
    jobPostSnapshot: JobPostSnapshot | null
    addedAt: IsoDateTime
    updatedAt: IsoDateTime
}

export interface ApplyQueueItem {
    post: JobPost
    jobPostSnapshot: JobPostSnapshot | null
    recommendationContext: JobRecommendationContext | null
    applicationArtifacts: ApplicationArtifact[]
}
