import type { UserAddedJobPost } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { toJobPost } from './job-post.mapper.ts'
import { toStandaloneJobRecommendation } from './search-report.mapper.ts'

export const userAddedJobPostInclude = {
    post: true,
} satisfies Prisma.UserAddedJobPostInclude

type PrismaUserAddedJobPost = Prisma.UserAddedJobPostGetPayload<{
    include: typeof userAddedJobPostInclude
}>

export const toUserAddedJobPost = (item: PrismaUserAddedJobPost): UserAddedJobPost => ({
    ...toStandaloneJobRecommendation(item),
    post: toJobPost(item.post),
    addedAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
})
