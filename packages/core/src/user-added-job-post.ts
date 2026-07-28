import type { IsoDateTime, JobPost, JobPostInput } from './job-post.ts'
import type { JobRecommendation } from './search-report.ts'

export type StandaloneJobRecommendation = Omit<JobRecommendation, 'agentRank'>

export type CreateUserAddedJobPostInput = StandaloneJobRecommendation & {
    post: JobPostInput
}

export type UserAddedJobPost = StandaloneJobRecommendation & {
    post: JobPost
    addedAt: IsoDateTime
    updatedAt: IsoDateTime
}
