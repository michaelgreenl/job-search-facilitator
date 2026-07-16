import type {
    ApplicationStatus,
    JobPost,
    PostStatus,
    UserLabel,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'

type PrismaJobPost = Prisma.JobPostGetPayload<object>

const applicationStatusToApi = {
    NOT_APPLIED: 'not-applied',
    AWAITING_RESPONSE: 'awaiting-response',
    INTERVIEWING: 'interviewing',
    REJECTED: 'rejected',
    HIRED: 'hired',
} satisfies Record<PrismaJobPost['applicationStatus'], ApplicationStatus>

const applicationStatusToPrisma = {
    'not-applied': 'NOT_APPLIED',
    'awaiting-response': 'AWAITING_RESPONSE',
    interviewing: 'INTERVIEWING',
    rejected: 'REJECTED',
    hired: 'HIRED',
} satisfies Record<ApplicationStatus, PrismaJobPost['applicationStatus']>

const postStatusToApi = {
    UNKNOWN: 'unknown',
    ACTIVE: 'active',
    CLOSED: 'closed',
} satisfies Record<PrismaJobPost['postStatus'], PostStatus>

const postStatusToPrisma = {
    unknown: 'UNKNOWN',
    active: 'ACTIVE',
    closed: 'CLOSED',
} satisfies Record<PostStatus, PrismaJobPost['postStatus']>

const userLabelToApi = {
    P1: 'P1',
    P2: 'P2',
    QUICK_APP: 'quick-app',
    FORGO: 'forgo',
} satisfies Record<NonNullable<PrismaJobPost['userLabel']>, UserLabel>

const userLabelToPrisma = {
    P1: 'P1',
    P2: 'P2',
    'quick-app': 'QUICK_APP',
    forgo: 'FORGO',
} satisfies Record<UserLabel, NonNullable<PrismaJobPost['userLabel']>>

export const toJobPost = (post: PrismaJobPost): JobPost => ({
    id: post.id,
    sourceKey: post.sourceKey,
    roleTitle: post.roleTitle,
    company: post.company,
    location: post.location,
    compensation: post.compensation,
    postSource: post.postSource,
    applicationUrl: post.applicationUrl,
    postStatus: postStatusToApi[post.postStatus],
    applicationStatus: applicationStatusToApi[post.applicationStatus],
    userRank: post.userRank,
    userLabel: post.userLabel === null ? null : userLabelToApi[post.userLabel],
    archivedAt: post.archivedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
})

export const toPrismaApplicationStatus = (status: ApplicationStatus) =>
    applicationStatusToPrisma[status]

export const toPrismaPostStatus = (status: PostStatus) => postStatusToPrisma[status]

export const toPrismaUserLabel = (label: UserLabel) => userLabelToPrisma[label]
