import type {
    ApplyQueueItem,
    CreateUserAddedJobPostInput,
    JobPost,
    JobRecommendationContext,
    UpdateJobPostInput,
    UpdateJobPostResult,
    UserAddedJobPost,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import {
    toJobPost,
    toPrismaJobPostListingData,
    toPrismaApplicationStatus,
    toPrismaPostStatus,
    toPrismaUserLabel,
    toUserAddedJobPost,
    userAddedJobPostInclude,
} from '../mappers/job-post.mapper.ts'
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

const toRecommendationContext = (
    result: PrismaApplyQueuePost['results'][number],
): JobRecommendationContext => ({
    reportId: result.report.id,
    reportDate: result.report.reportDate.toISOString().slice(0, 10),
    ...toJobRecommendation(result),
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

        if (input.applicationStatus !== undefined) {
            data.applicationStatus = toPrismaApplicationStatus(input.applicationStatus)
        }

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
            const [post, applyQueuePost] = await prisma.$transaction([
                prisma.jobPost.update({ where: { id }, data }),
                prisma.jobPost.findFirst({
                    where: {
                        id,
                        AND: applyQueueWhere,
                    },
                    select: { id: true },
                }),
            ])

            return {
                post: toJobPost(post),
                inApplyQueue: applyQueuePost !== null,
            }
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                return null
            }

            throw error
        }
    },
}
