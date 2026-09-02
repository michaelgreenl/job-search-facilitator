import { BAD_REQUEST, NOT_FOUND, type ApplicationArtifactKind } from '@job-search-facilitator/core'
import type { Request, Response } from 'express'
import type { ApplicationArtifactRepository } from '../../db/repositories/application-artifact.repository.ts'
import { applicationArtifactParamsSchema } from '../schemas/application-artifact.schema.ts'
import { contentDisposition, isPdf, readFileName } from '../file-upload.ts'

const invalidRequest = { error: 'Invalid application artifact' }
const jobPostNotFound = { error: 'Job post not found' }
const artifactNotFound = { error: 'Application artifact not found' }
const archiveExtensions = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.htm', 'text/html; charset=utf-8'],
    ['.webarchive', 'application/x-webarchive'],
    ['.mhtml', 'application/octet-stream'],
    ['.mht', 'application/octet-stream'],
])

const fileExtension = (fileName: string) => {
    const index = fileName.lastIndexOf('.')
    return index < 0 ? '' : fileName.slice(index).toLowerCase()
}

const validatedMediaType = (kind: ApplicationArtifactKind, fileName: string, content: Buffer) => {
    const extension = fileExtension(fileName)

    if (kind === 'resume' || kind === 'cover-letter') {
        return isPdf(fileName, content) ? 'application/pdf' : null
    }

    return archiveExtensions.get(extension) ?? null
}

export const createApplicationArtifactController = (repository: ApplicationArtifactRepository) => ({
    save: async (request: Request, response: Response): Promise<void> => {
        const params = applicationArtifactParamsSchema.safeParse(request.params)
        const fileName = readFileName(request)
        const content = Buffer.isBuffer(request.body) ? request.body : null

        if (!params.success || fileName === null || content === null || content.byteLength === 0) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const mediaType = validatedMediaType(params.data.kind, fileName, content)

        if (mediaType === null) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const artifact = await repository.save(params.data.id, params.data.kind, {
            content,
            fileName,
            mediaType,
        })

        if (artifact === null) {
            response.status(NOT_FOUND).json(jobPostNotFound)
            return
        }

        response.json(artifact)
    },

    open: async (request: Request, response: Response): Promise<void> => {
        const params = applicationArtifactParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        const file = await repository.findFile(params.data.id, params.data.kind)

        if (file === null) {
            response.status(NOT_FOUND).json(artifactNotFound)
            return
        }

        const headers: Record<string, string> = {
            'Cache-Control': 'private, no-store',
            'Content-Disposition': contentDisposition(file.artifact.fileName),
            'Content-Length': String(file.content.byteLength),
            'Content-Type': file.artifact.mediaType,
            'X-Content-Type-Options': 'nosniff',
        }

        if (file.artifact.mediaType.startsWith('text/html')) {
            headers['Content-Security-Policy'] = 'sandbox'
        }

        response.set(headers)
        response.end(file.content)
    },

    remove: async (request: Request, response: Response): Promise<void> => {
        const params = applicationArtifactParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json(invalidRequest)
            return
        }

        if (!(await repository.remove(params.data.id, params.data.kind))) {
            response.status(NOT_FOUND).json(artifactNotFound)
            return
        }

        response.status(204).end()
    },
})
