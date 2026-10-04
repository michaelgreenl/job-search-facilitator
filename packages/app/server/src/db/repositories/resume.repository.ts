import { type Resume, REPORT_RESUME_TYPES } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { prisma } from '../prisma.ts'

const resumeSelect = {
    id: true,
    name: true,
    uploads: {
        orderBy: { sequence: 'desc' },
        select: { id: true, fileName: true, sizeBytes: true, uploadedAt: true },
    },
} satisfies Prisma.ResumeSelect

const toResume = (resume: Prisma.ResumeGetPayload<{ select: typeof resumeSelect }>): Resume => ({
    ...resume,
    uploads: resume.uploads.map((upload) => ({
        ...upload,
        uploadedAt: upload.uploadedAt.toISOString(),
    })),
})

export class UnknownResumeError extends Error {
    constructor(names: string[]) {
        super(`Unknown resume: ${names.join(', ')}. Use a name from the resume library.`)
    }
}

export async function assertResumeNames(
    transaction: Prisma.TransactionClient,
    names: string[],
    legacyNames: readonly string[] = REPORT_RESUME_TYPES,
) {
    const resumes = await transaction.resume.findMany({ select: { name: true } })
    const allowed = new Set(resumes.length ? resumes.map(({ name }) => name) : legacyNames)
    const unknown = [...new Set(names)].filter((name) => !allowed.has(name))
    if (unknown.length) throw new UnknownResumeError(unknown)
}

export const resumeRepository = {
    async findMany() {
        return (
            await prisma.resume.findMany({ select: resumeSelect, orderBy: { name: 'asc' } })
        ).map(toResume)
    },

    async upload(target: { name: string } | { id: string }, fileName: string, content: Buffer) {
        const upload = { fileName, content: new Uint8Array(content), sizeBytes: content.length }
        const resume =
            'name' in target
                ? await prisma.resume.create({
                      data: { name: target.name, uploads: { create: upload } },
                      select: resumeSelect,
                  })
                : await prisma.resume.update({
                      where: { id: target.id },
                      data: { uploads: { create: upload } },
                      select: resumeSelect,
                  })
        return toResume(resume)
    },

    findFile(id: string) {
        return prisma.resumeUpload.findUnique({ where: { id } })
    },
}
