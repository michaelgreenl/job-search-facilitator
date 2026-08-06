import type { IsoDateTime } from './jobs.ts'

export const APPLICATION_ARTIFACT_KINDS = ['resume', 'cover-letter', 'application-page'] as const

export const MAX_APPLICATION_ARTIFACT_BYTES = 50 * 1024 * 1024

export type ApplicationArtifactKind = (typeof APPLICATION_ARTIFACT_KINDS)[number]

export interface ApplicationArtifact {
    kind: ApplicationArtifactKind
    fileName: string
    mediaType: string
    sizeBytes: number
    uploadedAt: IsoDateTime
}
