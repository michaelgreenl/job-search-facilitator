import type { ApplicationArtifact, ApplicationArtifactKind } from '@job-search-facilitator/core'
import {
    toApplicationArtifact,
    toPrismaApplicationArtifactKind,
} from '../mappers/application-artifact.mapper.ts'
import { prisma } from '../prisma.ts'

export interface ApplicationArtifactUpload {
    content: Buffer
    fileName: string
    mediaType: string
}

export interface ApplicationArtifactDownload {
    artifact: ApplicationArtifact
    content: Buffer
}

export interface ApplicationArtifactRepository {
    save(
        jobPostId: string,
        kind: ApplicationArtifactKind,
        upload: ApplicationArtifactUpload,
    ): Promise<ApplicationArtifact | null>
    findFile(
        jobPostId: string,
        kind: ApplicationArtifactKind,
    ): Promise<ApplicationArtifactDownload | null>
    remove(jobPostId: string, kind: ApplicationArtifactKind): Promise<boolean>
}

export const applicationArtifactRepository: ApplicationArtifactRepository = {
    async save(jobPostId, kind, upload) {
        const post = await prisma.jobPost.findUnique({
            where: { id: jobPostId },
            select: { id: true },
        })

        if (post === null) {
            return null
        }

        const artifactKind = toPrismaApplicationArtifactKind(kind)
        const content = Uint8Array.from(upload.content)
        const data = {
            fileName: upload.fileName,
            mediaType: upload.mediaType,
            sizeBytes: content.byteLength,
            content,
            uploadedAt: new Date(),
        }
        const artifact = await prisma.applicationArtifact.upsert({
            where: {
                jobPostId_kind: { jobPostId, kind: artifactKind },
            },
            create: {
                jobPostId,
                kind: artifactKind,
                ...data,
            },
            update: data,
            omit: { content: true, jobPostId: true },
        })

        return toApplicationArtifact(artifact)
    },

    async findFile(jobPostId, kind) {
        const artifact = await prisma.applicationArtifact.findUnique({
            where: {
                jobPostId_kind: {
                    jobPostId,
                    kind: toPrismaApplicationArtifactKind(kind),
                },
            },
        })

        return artifact === null
            ? null
            : {
                  artifact: toApplicationArtifact(artifact),
                  content: Buffer.from(artifact.content),
              }
    },

    async remove(jobPostId, kind) {
        const result = await prisma.applicationArtifact.deleteMany({
            where: {
                jobPostId,
                kind: toPrismaApplicationArtifactKind(kind),
            },
        })

        return result.count === 1
    },
}
