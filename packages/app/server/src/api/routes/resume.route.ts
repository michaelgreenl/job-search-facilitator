import express from 'express'
import { z } from 'zod'
import { MAX_APPLICATION_ARTIFACT_BYTES, resumeNameSchema } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { resumeRepository } from '../../db/repositories/resume.repository.ts'
import { contentDisposition, isPdf, readFileName } from '../file-upload.ts'

export const resumeRouter = express.Router()

resumeRouter.get('/', async (_request, response) => {
    response.json(await resumeRepository.findMany())
})

resumeRouter.post(
    ['/', '/:id/uploads'],
    express.raw({ limit: MAX_APPLICATION_ARTIFACT_BYTES, type: () => true }),
    async (request, response) => {
        const id = request.params.id
        const name = resumeNameSchema.safeParse(request.query.name)
        const fileName = readFileName(request)
        const content = request.body
        if (
            (id === undefined
                ? !name.success
                : typeof id !== 'string' || !z.uuid().safeParse(id).success) ||
            fileName === null ||
            !Buffer.isBuffer(content) ||
            !isPdf(fileName, content)
        ) {
            response
                .status(400)
                .json({ error: 'Provide a resume name and a PDF file (up to 50 MB).' })
            return
        }
        try {
            const target = typeof id === 'string' ? { id } : { name: name.data! }
            response.status(201).json(await resumeRepository.upload(target, fileName, content))
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                    response.status(409).json({
                        error: 'This name is already in use. Upload a new PDF to that resume or choose another name.',
                    })
                    return
                }
                if (error.code === 'P2025') {
                    response.status(404).json({ error: 'Resume not found.' })
                    return
                }
            }
            throw error
        }
    },
)

resumeRouter.get('/uploads/:id', async (request, response) => {
    if (!z.uuid().safeParse(request.params.id).success) {
        response.status(400).json({ error: 'Invalid upload ID.' })
        return
    }
    const file = await resumeRepository.findFile(request.params.id)
    if (file === null) {
        response.status(404).json({ error: 'Resume upload not found.' })
        return
    }
    response
        .set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': contentDisposition(
                file.fileName,
                request.query.download === 'true',
            ),
            'Content-Length': String(file.sizeBytes),
            'Cache-Control': 'private, no-store',
        })
        .end(Buffer.from(file.content))
})
