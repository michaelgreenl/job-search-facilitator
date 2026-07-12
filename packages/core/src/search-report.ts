import type { IsoDateTime, JobPost, JobPostInput } from './job-post.ts'

export const AGENT_LABELS = ['target', 'quick-app'] as const

export const RESUME_TYPES = ['frontend', 'backend-full-stack', 'general'] as const

export type AgentLabel = (typeof AGENT_LABELS)[number]

export type ResumeType = (typeof RESUME_TYPES)[number]

export interface JobSearchReport {
    id: string
    reportDate: string
    summary: string
    createdAt: IsoDateTime
    updatedAt: IsoDateTime
    archivedAt: IsoDateTime | null
    results: JobSearchResult[]
}

export interface JobSearchResult {
    agentRank: number
    agentLabel: AgentLabel
    fitRationale: string
    recommendedResume: ResumeType
    recommendedAction: string
    legitimacyNotes: string | null
    post: JobPost
}

export interface JobSearchResultInput {
    agentRank: number
    agentLabel: AgentLabel
    fitRationale: string
    recommendedResume: ResumeType
    recommendedAction: string
    legitimacyNotes: string | null
    post: JobPostInput
}

export interface UpsertJobSearchReportInput {
    summary: string
    results: JobSearchResultInput[]
}
