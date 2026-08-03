import type { ApplicationCaptureResult } from '@job-search-facilitator/core'
import { readResponseError } from '@/api'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

export async function saveApplicationCapture(jobPostId: string, capture: ApplicationCaptureResult) {
    const path = `/job-posts/${encodeURIComponent(jobPostId)}/application-capture`
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capture),
    })

    if (!response.ok) {
        throw new Error(
            (await readResponseError(response)) ?? `API request failed (${response.status})`,
        )
    }
}
