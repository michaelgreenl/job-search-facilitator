import type { ApplicationSnapshot } from './applications.ts'
import type { JobPostActivity } from './job-post-activity.ts'
import type { JobPost, JobPostNextStep, JobPostSnapshot } from './jobs.ts'
import type { OutreachContact } from './outreach.ts'

export interface TrackedJobPost {
    post: JobPost
    contacts: OutreachContact[]
    jobPostSnapshot: JobPostSnapshot | null
    applicationSnapshot: ApplicationSnapshot | null
    activities: JobPostActivity[]
    nextStep: JobPostNextStep | null
}
