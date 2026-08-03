import type { IsoDateTime } from './jobs.ts'

export interface ApplicationSnapshot {
    content: string
    sourceUrl: string
    capturedAt: IsoDateTime
}

export interface ApplicationCaptureResult {
    jobPost: {
        description: string
        sourceUrl: string
    }
    application: {
        content: string
        sourceUrl: string
    }
}
