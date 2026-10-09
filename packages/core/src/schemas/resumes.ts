import { z } from 'zod'
import { createParser, isoDateTimeSchema } from './shared.ts'
import { MAX_APPLICATION_ARTIFACT_BYTES } from '../types/applications.ts'

export const resumeNameSchema = z
    .string()
    // oxlint-disable-next-line no-control-regex -- JSON Schema needs portable control-character ranges.
    .regex(/^[^\x00-\x1f\x7f-\x9f]+$/)
    .trim()
    .min(1)
    .max(120)

const resumeUploadSchema = z.object({
    id: z.uuid(),
    fileName: z.string().min(1).max(255),
    sizeBytes: z.number().int().positive().max(MAX_APPLICATION_ARTIFACT_BYTES),
    uploadedAt: isoDateTimeSchema,
})

const resumeSchema = z.object({
    id: z.uuid(),
    name: resumeNameSchema,
    uploads: z.array(resumeUploadSchema).min(1),
})

export type Resume = z.infer<typeof resumeSchema>
export type ResumeUpload = z.infer<typeof resumeUploadSchema>
export const parseResume = createParser('Resume', resumeSchema)
export const parseResumes = createParser('Resume library', z.array(resumeSchema))
