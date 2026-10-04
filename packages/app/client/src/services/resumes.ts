import { parseResume, parseResumes } from '@job-search-facilitator/core'
import { apiUrl, parseApiResponse } from '@/api'

export async function fetchResumes() {
    return parseApiResponse(await fetch(`${apiUrl}/resumes`), parseResumes, '/resumes')
}

export const resumeUploadUrl = (id: string, download = false) =>
    `${apiUrl}/resumes/uploads/${encodeURIComponent(id)}${download ? '?download=true' : ''}`

export async function uploadResume(target: { name: string } | { id: string }, file: File) {
    const path =
        'id' in target
            ? `/resumes/${encodeURIComponent(target.id)}/uploads`
            : `/resumes?name=${encodeURIComponent(target.name)}`
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/pdf',
            'X-Artifact-Filename': encodeURIComponent(file.name),
        },
        body: file,
    })
    return parseApiResponse(response, parseResume, path)
}
