export const APPLICATION_STATUSES = [
    'not-applied',
    'awaiting-response',
    'interviewing',
    'rejected',
    'hired',
] as const

export const POST_STATUSES = ['unknown', 'active', 'closed'] as const

export const USER_LABELS = ['P1', 'P2', 'quick-app', 'forgo'] as const

export type IsoDateTime = string

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export type PostStatus = (typeof POST_STATUSES)[number]

export type UserLabel = (typeof USER_LABELS)[number]

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
    userRank: number | null
    userLabel: UserLabel | null
    archivedAt: IsoDateTime | null
    createdAt: IsoDateTime
    updatedAt: IsoDateTime
}

export interface JobPostInput {
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
}

export interface UpdateJobPostInput {
    applicationStatus?: ApplicationStatus
    postStatus?: PostStatus
    userRank?: number | null
    userLabel?: UserLabel | null
    archivedAt?: IsoDateTime | null
}
