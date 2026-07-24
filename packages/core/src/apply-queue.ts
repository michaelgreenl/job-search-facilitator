import type { JobPost } from './job-post.ts'
import type { JobRecommendationContext } from './search-report.ts'

export interface ApplyQueueItem {
    post: JobPost
    recommendationContext: JobRecommendationContext | null
}
