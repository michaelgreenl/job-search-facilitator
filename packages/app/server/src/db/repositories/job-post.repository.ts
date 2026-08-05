import type {
    ApplyQueueItem,
    CreateUserAddedJobPostInput,
    JobPost,
    JobRecommendationContext,
    TrackedJobPost,
    UpdateJobPostInput,
    UpdateJobPostResult,
    UserAddedJobPost,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { toApplicationSnapshot } from '../mappers/application.mapper.ts'
import { toJobPostActivity } from '../mappers/job-post-activity.mapper.ts'
import {
    toJobPost,
    toJobPostSnapshot,
    toPrismaJobPostListingData,
    toPrismaApplicationStatus,
    toPrismaPostStatus,
    toPrismaUserLabel,
    toUserAddedJobPost,
    userAddedJobPostInclude,
} from '../mappers/job-post.mapper.ts'
import { toOutreachContact } from '../mappers/outreach.mapper.ts'
import {
    toJobRecommendation,
    toPrismaAgentLabel,
    toPrismaResumeType,
} from '../mappers/search-report.mapper.ts'
import { prisma } from '../prisma.ts'

export interface UserAddedJobPostUpsertResult {
    item: UserAddedJobPost
    created: boolean
}

export interface JobPostRepository {
    findMany(): Promise<JobPost[]>
    findApplyQueue(): Promise<ApplyQueueItem[]>
    findTracked(): Promise<TrackedJobPost[]>
    findUserAdded(): Promise<UserAddedJobPost[]>
    findById(id: string): Promise<JobPost | null>
    upsertUserAdded(input: CreateUserAddedJobPostInput): Promise<UserAddedJobPostUpsertResult>
    update(id: string, input: UpdateJobPostInput): Promise<UpdateJobPostResult | null>
}

// postStatus and archivedAt remain outside this policy until their Apply queue behavior is defined.
const applyQueueWhere = {
    applicationStatus: 'NOT_APPLIED',
    userLabel: {
        not: null,
        notIn: ['FORGO'],
    },
} satisfies Prisma.JobPostWhereInput

// Archived reports remain eligible. Recency is report date, then creation time, then ID;
// updating an older report does not make its recommendation current.
const applyQueueInclude = {
    results: {
        take: 1,
        orderBy: [
            { report: { reportDate: 'desc' } },
            { report: { createdAt: 'desc' } },
            { reportId: 'asc' },
        ],
        include: {
            report: {
                select: {
                    id: true,
                    reportDate: true,
                },
            },
        },
    },
} satisfies Prisma.JobPostInclude

type PrismaApplyQueuePost = Prisma.JobPostGetPayload<{
    include: typeof applyQueueInclude
}>

const trackedJobPostInclude = {
    outreachContacts: {
        where: { messaged: true },
        orderBy: [{ messagedAt: 'desc' }, { id: 'asc' }],
    },
    snapshot: true,
    applicationSnapshot: true,
    activities: { orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }] },
} satisfies Prisma.JobPostInclude

const trackedJobPostWhere = {
    OR: [
        { applicationStatus: { not: 'NOT_APPLIED' } },
        { outreachContacts: { some: { messaged: true } } },
    ],
} satisfies Prisma.JobPostWhereInput

const applicationStatusStage = {
    NOT_APPLIED: 0,
    AWAITING_RESPONSE: 1,
    INTERVIEWING: 2,
    REJECTED: 3,
    HIRED: 3,
} as const

const manualStatusChanges = [
    { stage: 2, summary: 'Application status changed to interviewing' },
    { stage: 3, summary: 'Application status changed to rejected' },
    { stage: 3, summary: 'Application status changed to job offer' },
] as const

type PrismaTrackedJobPost = Prisma.JobPostGetPayload<{
    include: typeof trackedJobPostInclude
}>

const toRecommendationContext = (
    result: PrismaApplyQueuePost['results'][number],
): JobRecommendationContext => ({
    reportId: result.report.id,
    reportDate: result.report.reportDate.toISOString().slice(0, 10),
    ...toJobRecommendation(result),
})

const toTrackedJobPost = (post: PrismaTrackedJobPost): TrackedJobPost => ({
    post: toJobPost(post),
    contacts: post.outreachContacts.map(toOutreachContact),
    jobPostSnapshot: post.snapshot === null ? null : toJobPostSnapshot(post.snapshot),
    applicationSnapshot:
        post.applicationSnapshot === null ? null : toApplicationSnapshot(post.applicationSnapshot),
    activities: post.activities.map(toJobPostActivity),
})

export const jobPostRepository: JobPostRepository = {
    async findMany() {
        const posts = await prisma.jobPost.findMany({
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        })

        return posts.map(toJobPost)
    },

    async findApplyQueue() {
        const posts = await prisma.jobPost.findMany({
            where: applyQueueWhere,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            include: applyQueueInclude,
        })

        return posts.map((post) => ({
            post: toJobPost(post),
            recommendationContext:
                post.results[0] === undefined ? null : toRecommendationContext(post.results[0]),
        }))
    },

    async findTracked() {
        const posts = await prisma.jobPost.findMany({
            where: trackedJobPostWhere,
            include: trackedJobPostInclude,
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        })

        return posts.map(toTrackedJobPost)
    },

    async findUserAdded() {
        const items = await prisma.userAddedJobPost.findMany({
            include: userAddedJobPostInclude,
            orderBy: [{ createdAt: 'desc' }, { postId: 'asc' }],
        })

        return items.map(toUserAddedJobPost)
    },

    async findById(id) {
        const post = await prisma.jobPost.findUnique({ where: { id } })

        return post === null ? null : toJobPost(post)
    },

    async upsertUserAdded(input) {
        return prisma.$transaction(async (transaction) => {
            const listingData = toPrismaJobPostListingData(input.post)
            const post = await transaction.jobPost.upsert({
                where: { sourceKey: input.post.sourceKey },
                create: {
                    sourceKey: input.post.sourceKey,
                    ...listingData,
                },
                update: listingData,
                select: { id: true },
            })
            const recommendationData = {
                agentLabel: toPrismaAgentLabel(input.agentLabel),
                fitRationale: input.fitRationale,
                applicationFlow: input.applicationFlow,
                keyLegitimacySignals: input.keyLegitimacySignals,
                recommendedResume: toPrismaResumeType(input.recommendedResume),
                recommendedAction: input.recommendedAction,
                legitimacyNotes: input.legitimacyNotes,
            }
            const inserted = await transaction.userAddedJobPost.createMany({
                data: {
                    postId: post.id,
                    ...recommendationData,
                },
                skipDuplicates: true,
            })
            const savedItem = await transaction.userAddedJobPost.update({
                where: { postId: post.id },
                data: recommendationData,
                include: userAddedJobPostInclude,
            })

            return {
                item: toUserAddedJobPost(savedItem),
                created: inserted.count === 1,
            }
        })
    },

    async update(id, input) {
        const data: Prisma.JobPostUpdateInput = {}

        if (input.postStatus !== undefined) {
            data.postStatus = toPrismaPostStatus(input.postStatus)
        }

        if (input.userLabel !== undefined) {
            data.userLabel = input.userLabel === null ? null : toPrismaUserLabel(input.userLabel)
        }

        if (input.archivedAt !== undefined) {
            data.archivedAt = input.archivedAt === null ? null : new Date(input.archivedAt)
        }

        try {
            return await prisma.$transaction(async (transaction) => {
                const existing = await transaction.jobPost.findUnique({
                    where: { id },
                    select: { applicationStatus: true, appliedAt: true },
                })

                if (existing === null) {
                    return null
                }

                const applicationStatus =
                    input.applicationStatus === undefined
                        ? undefined
                        : toPrismaApplicationStatus(input.applicationStatus)
                const applicationStatusChanged =
                    applicationStatus !== undefined &&
                    applicationStatus !== existing.applicationStatus
                const statusChangedAt = applicationStatusChanged ? new Date() : null

                if (applicationStatus !== undefined) {
                    data.applicationStatus = applicationStatus
                }

                if (statusChangedAt !== null) {
                    data.applicationStatusUpdatedAt = statusChangedAt
                    data.appliedAt =
                        applicationStatus === 'NOT_APPLIED'
                            ? null
                            : (existing.appliedAt ?? statusChangedAt)
                }

                const post = await transaction.jobPost.update({ where: { id }, data })

                if (statusChangedAt !== null) {
                    const resetsApplication =
                        existing.applicationStatus === 'NOT_APPLIED' ||
                        post.applicationStatus === 'NOT_APPLIED'
                    const reversesApplication =
                        applicationStatusStage[post.applicationStatus] <
                        applicationStatusStage[existing.applicationStatus]
                    const replacesTerminalOutcome =
                        applicationStatusStage[post.applicationStatus] === 3 &&
                        applicationStatusStage[existing.applicationStatus] === 3

                    if (resetsApplication) {
                        await transaction.jobPostActivity.deleteMany({
                            where: {
                                jobPostId: id,
                                source: 'MANUAL',
                                type: {
                                    in: ['APPLICATION_SUBMITTED', 'APPLICATION_STATUS_CHANGED'],
                                },
                            },
                        })
                    } else if (reversesApplication || replacesTerminalOutcome) {
                        const selectedStage = applicationStatusStage[post.applicationStatus]
                        const summaries = manualStatusChanges
                            .filter(
                                ({ stage }) =>
                                    stage > selectedStage ||
                                    (replacesTerminalOutcome && stage === selectedStage),
                            )
                            .map(({ summary }) => summary)

                        await transaction.jobPostActivity.deleteMany({
                            where: {
                                jobPostId: id,
                                source: 'MANUAL',
                                type: 'APPLICATION_STATUS_CHANGED',
                                summary: { in: summaries },
                            },
                        })
                    }

                    if (post.applicationStatus !== 'NOT_APPLIED' && !reversesApplication) {
                        await transaction.jobPostActivity.create({
                            data: {
                                jobPostId: id,
                                type:
                                    existing.applicationStatus === 'NOT_APPLIED' &&
                                    post.applicationStatus === 'AWAITING_RESPONSE'
                                        ? 'APPLICATION_SUBMITTED'
                                        : 'APPLICATION_STATUS_CHANGED',
                                source: 'MANUAL',
                                summary:
                                    existing.applicationStatus === 'NOT_APPLIED' &&
                                    post.applicationStatus === 'AWAITING_RESPONSE'
                                        ? 'Application submitted'
                                        : `Application status changed to ${input.applicationStatus === 'hired' ? 'job offer' : input.applicationStatus}`,
                                occurredAt: statusChangedAt,
                            },
                        })
                    }
                }

                const applyQueuePost = await transaction.jobPost.findFirst({
                    where: {
                        id,
                        AND: applyQueueWhere,
                    },
                    select: { id: true },
                })

                return {
                    post: toJobPost(post),
                    inApplyQueue: applyQueuePost !== null,
                }
            })
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                return null
            }

            throw error
        }
    },
}
