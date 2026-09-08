import { z } from 'zod'
import {
    MAX_PROFILE_SECTION_CHARACTERS,
    MAX_RESUME_VERSION_NAME_CHARACTERS,
    type BaseResumeVersion,
    type JobSearchSettings,
    type UpdateJobSearchSettingsInput,
} from '../types/settings.ts'
import { createParser, isoDateTimeSchema, nonBlankStringSchema } from './shared.ts'

const profileSectionSchema = z.strictObject({
    title: z.string().trim().min(1).max(120),
    content: z.string().trim().max(MAX_PROFILE_SECTION_CHARACTERS),
})

const sectionsSchema = z
    .array(profileSectionSchema)
    .max(40)
    .superRefine((sections, context) => {
        const titles = new Set<string>()

        sections.forEach(({ title }, index) => {
            const key = title.toLocaleLowerCase()

            if (titles.has(key)) {
                context.addIssue({
                    code: 'custom',
                    message: 'Profile section titles must be unique',
                    path: [index, 'title'],
                })
            }

            titles.add(key)
        })
    })

export const resumeVersionNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(MAX_RESUME_VERSION_NAME_CHARACTERS)

export const baseResumeVersionSchema: z.ZodType<BaseResumeVersion> = z.strictObject({
    id: z.uuid(),
    name: resumeVersionNameSchema,
    fileName: nonBlankStringSchema,
    sizeBytes: z.number().int().positive(),
    uploadedAt: isoDateTimeSchema,
})

export const updateJobSearchSettingsInputSchema: z.ZodType<UpdateJobSearchSettingsInput> =
    z.strictObject({ sections: sectionsSchema })

const jobSearchSettingsSchema: z.ZodType<JobSearchSettings> = z.strictObject({
    sections: sectionsSchema,
    resumes: z.array(baseResumeVersionSchema),
})

export const parseBaseResumeVersion = createParser('Base resume version', baseResumeVersionSchema)
export const parseJobSearchSettings = createParser('Job search settings', jobSearchSettingsSchema)
