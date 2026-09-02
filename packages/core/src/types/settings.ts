import type { IsoDateTime } from './jobs.ts'

export const MAX_PROFILE_SECTION_CHARACTERS = 100_000
export const MAX_RESUME_VERSION_NAME_CHARACTERS = 200

export interface ProfileSection {
    title: string
    content: string
}

export interface BaseResumeVersion {
    id: string
    name: string
    fileName: string
    sizeBytes: number
    uploadedAt: IsoDateTime
}

export interface JobSearchSettings {
    sections: ProfileSection[]
    resumes: BaseResumeVersion[]
}

export interface UpdateJobSearchSettingsInput {
    sections: ProfileSection[]
}
