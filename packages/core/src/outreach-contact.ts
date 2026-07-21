import type { IsoDateTime } from './job-post.ts'

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
