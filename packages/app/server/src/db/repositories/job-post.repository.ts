import type { JobPost, UpdateJobPostInput } from '@job-search-facilitator/core'
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
    findLabeled(): Promise<JobPost[]>
    findById(id: string): Promise<JobPost | null>
    update(id: string, input: UpdateJobPostInput): Promise<JobPost | null>
}

export const jobPostRepository: JobPostRepository = {
    async findMany() {
        const posts = await prisma.jobPost.findMany({
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        })

        return posts.map(toJobPost)
    },

    async findLabeled() {
        const posts = await prisma.jobPost.findMany({
            where: { userLabel: { notIn: ['FORGO'] } },
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

        if (input.userRank !== undefined) {
            data.userRank = input.userRank
        }

        if (input.userLabel !== undefined) {
            data.userLabel = input.userLabel === null ? null : toPrismaUserLabel(input.userLabel)
        }

        if (input.archivedAt !== undefined) {
            data.archivedAt = input.archivedAt === null ? null : new Date(input.archivedAt)
        }

        try {
            const post = await prisma.jobPost.update({ where: { id }, data })

            return toJobPost(post)
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                return null
            }

            throw error
        }
    },
}
