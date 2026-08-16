import type { ApplicationArtifact } from './applications.ts'
import type { JobPostActivity } from './job-post-activity.ts'
import type { JobPost, JobPostSnapshot } from './jobs.ts'
import type { OutreachContact } from './outreach.ts'

export interface TrackedJobPost {
    post: JobPost
    contacts: OutreachContact[]
    jobPostSnapshot: JobPostSnapshot | null
    applicationArtifacts: ApplicationArtifact[]
    activities: JobPostActivity[]
}
