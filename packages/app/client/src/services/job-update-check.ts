import {
    parseJobUpdateCheckContext,
    parseSavedJobUpdates,
    type JobUpdateCheckResult,
} from '@job-search-facilitator/core'
import { parseApiResponse } from '@/api'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

export async function fetchJobUpdateCheckContext() {
    const path = '/job-update-check/context'
    const response = await fetch(`${apiUrl}${path}`)

    return parseApiResponse(response, parseJobUpdateCheckContext, path)
}

export async function saveJobUpdates(result: JobUpdateCheckResult) {
    const path = '/job-update-check'
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
    })

    return parseApiResponse(response, parseSavedJobUpdates, path)
}
