import type {
    ApplicationStatus,
    JobPost,
    JobPostInput,
    JobPostNextStep,
    JobPostSnapshot,
    PostStatus,
    UserAddedJobPost,
    UserLabel,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { toStandaloneJobRecommendation } from './search-report.mapper.ts'

type PrismaJobPost = Prisma.JobPostGetPayload<object>
type PrismaJobPostSnapshot = Prisma.JobPostSnapshotGetPayload<object>

export const userAddedJobPostInclude = {
    post: true,
} satisfies Prisma.UserAddedJobPostInclude

type PrismaUserAddedJobPost = Prisma.UserAddedJobPostGetPayload<{
    include: typeof userAddedJobPostInclude
}>

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
    techStack: post.techStack,
    postSource: post.postSource,
    postUrl: post.postUrl,
    applicationUrl: post.applicationUrl,
    postStatus: postStatusToApi[post.postStatus],
    applicationStatus: applicationStatusToApi[post.applicationStatus],
    appliedAt: post.appliedAt?.toISOString() ?? null,
    userLabel: post.userLabel === null ? null : userLabelToApi[post.userLabel],
    archivedAt: post.archivedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
})

export const toJobPostSnapshot = (snapshot: PrismaJobPostSnapshot): JobPostSnapshot => ({
    description: snapshot.description,
    sourceUrl: snapshot.sourceUrl,
    capturedAt: snapshot.capturedAt.toISOString(),
})

export const toJobPostNextStep = (post: PrismaJobPost): JobPostNextStep | null =>
    post.nextStepTitle === null || post.nextStepDueAt === null
        ? null
        : {
              title: post.nextStepTitle,
              dueAt: post.nextStepDueAt.toISOString(),
              completedAt: post.nextStepCompletedAt?.toISOString() ?? null,
          }

export const toUserAddedJobPost = (item: PrismaUserAddedJobPost): UserAddedJobPost => ({
    ...toStandaloneJobRecommendation(item),
    post: toJobPost(item.post),
    addedAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
})

export const toPrismaApplicationStatus = (status: ApplicationStatus) =>
    applicationStatusToPrisma[status]

export const toPrismaPostStatus = (status: PostStatus) => postStatusToPrisma[status]

export const toPrismaUserLabel = (label: UserLabel) => userLabelToPrisma[label]

export const toPrismaJobPostListingData = (post: JobPostInput) =>
    ({
        roleTitle: post.roleTitle,
        company: post.company,
        location: post.location,
        compensation: post.compensation,
        techStack: post.techStack,
        postSource: post.postSource,
        postUrl: post.postUrl,
        applicationUrl: post.applicationUrl,
        postStatus: toPrismaPostStatus(post.postStatus),
    }) satisfies Prisma.JobPostUpdateInput
