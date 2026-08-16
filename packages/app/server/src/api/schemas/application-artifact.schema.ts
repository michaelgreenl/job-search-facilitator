import { APPLICATION_ARTIFACT_KINDS } from '@job-search-facilitator/core'
import { z } from 'zod'

export const applicationArtifactParamsSchema = z.strictObject({
    id: z.uuid(),
    kind: z.enum(APPLICATION_ARTIFACT_KINDS),
})
