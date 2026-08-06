import { z } from 'zod'
import { APPLICATION_ARTIFACT_KINDS, type ApplicationArtifact } from '../types/applications.ts'
import { createParser, isoDateTimeSchema, nonBlankStringSchema } from './shared.ts'

export const applicationArtifactSchema: z.ZodType<ApplicationArtifact> = z.looseObject({
    kind: z.enum(APPLICATION_ARTIFACT_KINDS),
    fileName: nonBlankStringSchema,
    mediaType: nonBlankStringSchema,
    sizeBytes: z.number().int().positive(),
    uploadedAt: isoDateTimeSchema,
})

export const parseApplicationArtifact = createParser(
    'Application artifact',
    applicationArtifactSchema,
)
