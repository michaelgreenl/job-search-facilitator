import { z } from 'zod'
import type { JsonObject, WorkOutputSchema } from '../types/work.ts'

export type RuntimeParser<T> = (value: unknown) => T

const WORK_OUTPUT_SCHEMA_DIALECT = 'http://json-schema.org/draft-07/schema#'

export const createParser =
    <T>(name: string, schema: z.ZodType<T>): RuntimeParser<T> =>
    (value) => {
        const result = schema.safeParse(value)

        if (!result.success) {
            throw new Error(`${name} did not match its runtime contract`, {
                cause: result.error,
            })
        }

        return result.data
    }

export const nonBlankStringSchema = z.string().refine((value) => value.trim().length > 0)
export const isoDateTimeSchema = z.iso.datetime({ offset: true })
export const httpUrlSchema = z.url().refine((value) => {
    const protocol = new URL(value).protocol

    return protocol === 'http:' || protocol === 'https:'
})
export const linkedInProfileUrlSchema = z.url().refine((value) => {
    const url = new URL(value)
    const linkedInHost = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')

    return url.protocol === 'https:' && linkedInHost && url.pathname.startsWith('/in/')
})
export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), z.unknown())

export const toWorkOutputSchema = (schema: z.ZodType): WorkOutputSchema => {
    const { $schema, ...jsonSchema } = z.toJSONSchema(schema, {
        target: 'draft-07',
        io: 'input',
    })

    if (
        jsonSchema.type !== 'object' ||
        $schema !== WORK_OUTPUT_SCHEMA_DIALECT ||
        jsonSchema.$async === true
    ) {
        throw new Error('Could not create a supported Work output schema')
    }

    return jsonSchema as WorkOutputSchema
}
