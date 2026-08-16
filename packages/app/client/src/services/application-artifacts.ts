import {
    parseApplicationArtifact,
    type ApplicationArtifactKind,
} from '@job-search-facilitator/core'
import { apiUrl, parseApiResponse, readResponseError } from '@/api'

const artifactPath = (jobPostId: string, kind: ApplicationArtifactKind) =>
    `/job-posts/${encodeURIComponent(jobPostId)}/artifacts/${encodeURIComponent(kind)}`

export const applicationArtifactUrl = (jobPostId: string, kind: ApplicationArtifactKind) =>
    `${apiUrl}${artifactPath(jobPostId, kind)}`

export async function uploadApplicationArtifact(
    jobPostId: string,
    kind: ApplicationArtifactKind,
    file: File,
) {
    const path = artifactPath(jobPostId, kind)
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'PUT',
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Artifact-Filename': encodeURIComponent(file.name),
        },
        body: file,
    })

    return parseApiResponse(response, parseApplicationArtifact, path)
}

export async function removeApplicationArtifact(jobPostId: string, kind: ApplicationArtifactKind) {
    const path = artifactPath(jobPostId, kind)
    const response = await fetch(`${apiUrl}${path}`, { method: 'DELETE' })

    if (!response.ok) {
        throw new Error(
            (await readResponseError(response)) ?? `API request failed (${response.status})`,
        )
    }
}
