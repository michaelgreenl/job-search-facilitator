import type { ApplicationArtifact, ApplicationArtifactKind } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'

type PrismaApplicationArtifact = Prisma.ApplicationArtifactGetPayload<object>

const artifactKindToApi = {
    RESUME: 'resume',
    COVER_LETTER: 'cover-letter',
    APPLICATION_PAGE: 'application-page',
} satisfies Record<PrismaApplicationArtifact['kind'], ApplicationArtifactKind>

const artifactKindToPrisma = {
    resume: 'RESUME',
    'cover-letter': 'COVER_LETTER',
    'application-page': 'APPLICATION_PAGE',
} satisfies Record<ApplicationArtifactKind, PrismaApplicationArtifact['kind']>

export const toApplicationArtifact = (
    artifact: Omit<PrismaApplicationArtifact, 'content' | 'jobPostId'>,
): ApplicationArtifact => ({
    kind: artifactKindToApi[artifact.kind],
    fileName: artifact.fileName,
    mediaType: artifact.mediaType,
    sizeBytes: artifact.sizeBytes,
    uploadedAt: artifact.uploadedAt.toISOString(),
})

export const toPrismaApplicationArtifactKind = (kind: ApplicationArtifactKind) =>
    artifactKindToPrisma[kind]
