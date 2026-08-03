import type { IsoDateTime } from './jobs.ts'

export interface JobPostActivity {
    id: string
    summary: string
    sourceUrl: string | null
    occurredAt: IsoDateTime
}
