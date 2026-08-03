import {
    parseApplyQueueItems,
    parseJobPost,
    parseJobPosts,
    parseJobPostNextStep,
    parseTrackedJobPosts,
    parseUpdateJobPostResult,
    parseUserAddedJobPost,
    parseUserAddedJobPosts,
    type CreateUserAddedJobPostInput,
    type SaveJobPostNextStepInput,
    type UpdateJobPostInput,
} from '@job-search-facilitator/core'
import { parseApiResponse } from '@/api'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

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

export async function saveJobPostNextStep(id: string, input: SaveJobPostNextStepInput) {
    const path = `/job-posts/${encodeURIComponent(id)}/next-step`
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

    return parseApiResponse(response, parseJobPostNextStep, path)
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
