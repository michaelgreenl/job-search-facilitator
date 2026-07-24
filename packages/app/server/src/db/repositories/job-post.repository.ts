import type { JobPost, UpdateJobPostInput, UpdateJobPostResult } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import {
    toJobPost,
    toPrismaApplicationStatus,
    toPrismaPostStatus,
    toPrismaUserLabel,
} from '../mappers/job-post.mapper.ts'
import { prisma } from '../prisma.ts'

export interface JobPostRepository {
    findMany(): Promise<JobPost[]>
    findApplyQueue(): Promise<JobPost[]>
    findById(id: string): Promise<JobPost | null>
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
        })

        return posts.map(toJobPost)
    },

    async findById(id) {
        const post = await prisma.jobPost.findUnique({ where: { id } })

        return post === null ? null : toJobPost(post)
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
