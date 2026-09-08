import {
    BAD_REQUEST,
    CONFLICT,
    CREATED,
    MAX_RESUME_VERSION_NAME_CHARACTERS,
    NOT_FOUND,
    resumeVersionNameSchema,
    updateJobSearchSettingsInputSchema,
} from '@job-search-facilitator/core'
import type { Request, Response } from 'express'
import { z } from 'zod'
import {
    DuplicateResumeNameError,
    type SettingsRepository,
} from '../../settings/file-settings.repository.ts'
import { contentDisposition, isPdf, readEncodedHeader, readFileName } from '../file-upload.ts'

const invalidSettings = { error: 'Invalid settings' }
const invalidResume = { error: 'Invalid resume version' }
const resumeNotFound = { error: 'Resume version not found' }
const duplicateResumeName = { error: 'Use a unique resume version name' }
const resumeParamsSchema = z.strictObject({ id: z.uuid() })

export const createSettingsController = (repository: SettingsRepository) => ({
    get: async (_request: Request, response: Response): Promise<void> => {
        response.json(await repository.find())
    },

    save: async (request: Request, response: Response): Promise<void> => {
        const input = updateJobSearchSettingsInputSchema.safeParse(request.body)

        if (!input.success) {
            response.status(BAD_REQUEST).json(invalidSettings)
            return
        }

        response.json(await repository.save(input.data))
    },

    uploadResume: async (request: Request, response: Response): Promise<void> => {
        const name = resumeVersionNameSchema.safeParse(
            readEncodedHeader(request, 'x-resume-version-name', MAX_RESUME_VERSION_NAME_CHARACTERS),
        )
        const fileName = readFileName(request)
        const content = Buffer.isBuffer(request.body) ? request.body : null

        if (
            !name.success ||
            fileName === null ||
            content === null ||
            content.byteLength === 0 ||
            !isPdf(fileName, content)
        ) {
            response.status(BAD_REQUEST).json(invalidResume)
            return
        }

        try {
            response.status(CREATED).json(
                await repository.addResume({
                    content,
                    fileName,
                    name: name.data,
                }),
            )
        } catch (error) {
            if (error instanceof DuplicateResumeNameError) {
                response.status(CONFLICT).json(duplicateResumeName)
                return
            }

            throw error
        }
    },

    openResume: async (request: Request, response: Response): Promise<void> => {
        const params = resumeParamsSchema.safeParse(request.params)

        if (!params.success) {
            response.status(BAD_REQUEST).json(invalidResume)
            return
        }

        const file = await repository.findResume(params.data.id)

        if (file === null) {
            response.status(NOT_FOUND).json(resumeNotFound)
            return
        }

        response.set({
            'Cache-Control': 'private, no-store',
            'Content-Disposition': contentDisposition(file.resume.fileName),
            'Content-Length': String(file.content.byteLength),
            'Content-Type': 'application/pdf',
            'X-Content-Type-Options': 'nosniff',
        })
        response.end(file.content)
    },
})
