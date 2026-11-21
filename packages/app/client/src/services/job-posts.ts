import {
    parseApplyQueueItems,
    parseJobPost,
    parseJobPosts,
    parseRecordedJobUpdates,
    parseTrackedJobPosts,
    parseUpdateJobPostResult,
    parseUserAddedJobPost,
    parseUserAddedJobPosts,
    type CreateUserAddedJobPostInput,
    type RecordedJobUpdateChange,
    type UpdateJobPostInput,
} from '@job-search-facilitator/core'
import { apiUrl, parseApiResponse, readResponseError } from '@/api'

export async function fetchJobPosts() {
    const path = '/job-posts'
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseJobPosts, path)
}

export async function fetchApplyQueue() {
    const path = '/job-posts/apply-queue'
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseApplyQueueItems, path)
}

export async function fetchTrackedPosts() {
    const path = '/job-posts/tracked'
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseTrackedJobPosts, path)
}

export async function fetchRecordedJobUpdates() {
    const path = '/job-update-check/updates'
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseRecordedJobUpdates, path)
}

export async function changeRecordedJobUpdates(change: RecordedJobUpdateChange) {
    const response = await fetch(`${apiUrl}/job-update-check/updates`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
    })

    if (!response.ok) {
        throw new Error(
            (await readResponseError(response)) ?? `API request failed (${response.status})`,
        )
    }
}

export async function fetchUserAddedJobPosts() {
    const path = '/job-posts/user-added'
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseUserAddedJobPosts, path)
}

export async function createUserAddedJobPost(input: CreateUserAddedJobPostInput) {
    const path = '/job-posts'
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

    return parseApiResponse(response, parseUserAddedJobPost, path)
}

export async function removeUserAddedJobPost(id: string) {
    const path = `/job-posts/user-added/${encodeURIComponent(id)}`
    const response = await fetch(`${apiUrl}${path}`, { method: 'DELETE' })

    if (!response.ok) {
        throw new Error(
            (await readResponseError(response)) ?? `API request failed (${response.status})`,
        )
    }
}

export async function fetchJobPost(id: string) {
    const path = `/job-posts/${encodeURIComponent(id)}`
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseJobPost, path)
}

export async function updateJobPost(id: string, input: UpdateJobPostInput) {
    const path = `/job-posts/${encodeURIComponent(id)}`
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

    return parseApiResponse(response, parseUpdateJobPostResult, path)
}
