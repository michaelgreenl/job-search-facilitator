import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
    baseResumeVersionSchema,
    type BaseResumeVersion,
    type JobSearchSettings,
    type ProfileSection,
    type UpdateJobSearchSettingsInput,
} from '@job-search-facilitator/core'
import { z } from 'zod'
import { env } from '../config/env.ts'

const generatedResumeStart = '<!-- job-search-facilitator:resume-versions:start -->'
const generatedResumeEnd = '<!-- job-search-facilitator:resume-versions:end -->'
const defaultPreamble = `# Job Search Profile

This file gives agents the applicant facts and preferences they can use.

Do not include secrets, passwords, government identifiers, or unnecessary personal data.`
const defaultSectionTitles = [
    'Target work',
    'Professional experience',
    'Substantial project evidence',
    'Skills and evidence levels',
    'Education and credentials',
    'Work eligibility and sector limits',
    'Location and travel',
    'Compensation',
    'Application preferences',
    'Result rules',
]
const storedResumeVersionsSchema = z.array(baseResumeVersionSchema)

export interface ResumeUpload {
    content: Buffer
    fileName: string
    name: string
}

export interface ResumeDownload {
    content: Buffer
    resume: BaseResumeVersion
}

export interface SettingsRepository {
    find(): Promise<JobSearchSettings>
    save(input: UpdateJobSearchSettingsInput): Promise<JobSearchSettings>
    addResume(upload: ResumeUpload): Promise<BaseResumeVersion>
    findResume(id: string): Promise<ResumeDownload | null>
}

export class DuplicateResumeNameError extends Error {}

const isMissingFile = (error: unknown) =>
    error instanceof Error && 'code' in error && error.code === 'ENOENT'

const stripGeneratedResumeSection = (document: string) => {
    const start = document.indexOf(generatedResumeStart)
    const end = document.indexOf(generatedResumeEnd)

    if (start < 0 || end < start) {
        return document.trim()
    }

    return `${document.slice(0, start)}${document.slice(end + generatedResumeEnd.length)}`.trim()
}

export const parseProfileDocument = (document: string) => {
    const editableDocument = stripGeneratedResumeSection(document)
    const headings = [...editableDocument.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)]

    if (headings.length === 0) {
        return {
            preamble: editableDocument.trim() || defaultPreamble,
            sections: defaultSectionTitles.map((title) => ({ title, content: '' })),
        }
    }

    return {
        preamble: editableDocument.slice(0, headings[0]!.index).trim(),
        sections: headings.map((heading, index) => ({
            title: heading[1]!.trim(),
            content: editableDocument
                .slice(
                    heading.index + heading[0].length,
                    headings[index + 1]?.index ?? editableDocument.length,
                )
                .trim(),
        })),
    }
}

export const renderProfileDocument = (
    preamble: string,
    sections: ProfileSection[],
    resumes: BaseResumeVersion[],
) => {
    const editable = [
        preamble.trim() || defaultPreamble,
        ...sections.map(({ title, content }) => `## ${title}\n\n${content.trim()}`),
    ].join('\n\n')

    if (resumes.length === 0) {
        return `${editable.trim()}\n`
    }

    const resumeItems = resumes
        .map(
            ({ id, name, fileName, uploadedAt }) =>
                `- ${JSON.stringify(name)}: \`docs/agents/job-search/resumes/${id}.pdf\` ` +
                `(uploaded ${uploadedAt}; source file ${JSON.stringify(fileName)})`,
        )
        .join('\n')

    return `${editable.trim()}\n\n${generatedResumeStart}\n## Available resume versions\n\nThis list replaces resume names in earlier sections. Use one exact version name below for \`recommendedResume\`. Prefer the newest suitable version.\n\n${resumeItems}\n${generatedResumeEnd}\n`
}

const writeAtomically = async (path: string, content: string | Buffer) => {
    await mkdir(dirname(path), { recursive: true })
    const temporaryPath = `${path}.${randomUUID()}.tmp`

    try {
        await writeFile(temporaryPath, content, { flag: 'wx', mode: 0o600 })
        await rename(temporaryPath, path)
    } finally {
        await rm(temporaryPath, { force: true })
    }
}

export const createFileSettingsRepository = (
    contextDirectory = env.AGENT_CONTEXT_DIRECTORY,
): SettingsRepository => {
    // ponytail: This local single-user store has no write queue; serialize writes if concurrent clients matter.
    const profilePath = join(contextDirectory, 'user-info.md')
    const resumeDirectory = join(contextDirectory, 'resumes')
    const resumeIndexPath = join(resumeDirectory, 'index.json')

    const readProfile = async () => {
        try {
            return parseProfileDocument(await readFile(profilePath, 'utf8'))
        } catch (error) {
            if (isMissingFile(error)) {
                return parseProfileDocument(defaultPreamble)
            }

            throw error
        }
    }

    const readResumes = async (): Promise<BaseResumeVersion[]> => {
        try {
            return storedResumeVersionsSchema.parse(
                JSON.parse(await readFile(resumeIndexPath, 'utf8')),
            )
        } catch (error) {
            if (isMissingFile(error)) {
                return []
            }

            throw error
        }
    }

    const writeProfile = async (sections: ProfileSection[], resumes: BaseResumeVersion[]) => {
        const { preamble } = await readProfile()
        await writeAtomically(profilePath, renderProfileDocument(preamble, sections, resumes))
    }

    return {
        async find() {
            const [{ sections }, resumes] = await Promise.all([readProfile(), readResumes()])
            return { sections, resumes }
        },

        async save({ sections }) {
            const resumes = await readResumes()
            await writeProfile(sections, resumes)
            return { sections, resumes }
        },

        async addResume(upload) {
            const resumes = await readResumes()

            if (
                resumes.some(
                    ({ name }) => name.toLocaleLowerCase() === upload.name.toLocaleLowerCase(),
                )
            ) {
                throw new DuplicateResumeNameError()
            }

            const resume: BaseResumeVersion = {
                id: randomUUID(),
                name: upload.name,
                fileName: upload.fileName,
                sizeBytes: upload.content.byteLength,
                uploadedAt: new Date().toISOString(),
            }
            const resumePath = join(resumeDirectory, `${resume.id}.pdf`)
            const nextResumes = [resume, ...resumes]

            await writeAtomically(resumePath, upload.content)

            try {
                await writeAtomically(resumeIndexPath, `${JSON.stringify(nextResumes, null, 2)}\n`)
                const { sections } = await readProfile()
                await writeProfile(sections, nextResumes)
            } catch (error) {
                if (resumes.length === 0) {
                    await rm(resumeIndexPath, { force: true })
                } else {
                    await writeAtomically(resumeIndexPath, `${JSON.stringify(resumes, null, 2)}\n`)
                }

                await rm(resumePath, { force: true })
                throw error
            }

            return resume
        },

        async findResume(id) {
            const resume = (await readResumes()).find((candidate) => candidate.id === id)

            if (resume === undefined) {
                return null
            }

            return {
                resume,
                content: await readFile(join(resumeDirectory, `${resume.id}.pdf`)),
            }
        },
    }
}

export const settingsRepository = createFileSettingsRepository()
