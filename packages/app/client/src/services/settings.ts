import {
    parseBaseResumeVersion,
    parseJobSearchSettings,
    type ProfileSection,
} from '@job-search-facilitator/core'
import { apiUrl, parseApiResponse } from '@/api'

const settingsPath = '/settings'

export const baseResumeUrl = (id: string) =>
    `${apiUrl}${settingsPath}/resumes/${encodeURIComponent(id)}`

export async function fetchSettings() {
    const response = await fetch(`${apiUrl}${settingsPath}`)
    return parseApiResponse(response, parseJobSearchSettings, settingsPath)
}

export async function saveSettings(sections: ProfileSection[]) {
    const response = await fetch(`${apiUrl}${settingsPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
    })

    return parseApiResponse(response, parseJobSearchSettings, settingsPath)
}

export async function uploadBaseResume(name: string, file: File) {
    const path = `${settingsPath}/resumes`
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': file.type || 'application/pdf',
            'X-Artifact-Filename': encodeURIComponent(file.name),
            'X-Resume-Version-Name': encodeURIComponent(name),
        },
        body: file,
    })

    return parseApiResponse(response, parseBaseResumeVersion, path)
}
