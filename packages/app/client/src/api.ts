import type { JobPost, JobSearchReport, UpdateJobPostInput } from '@job-search-facilitator/core'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, init)

    if (!response.ok) {
        throw new Error(`API request failed (${response.status})`)
    }

    return response.json() as Promise<T>
}

export const getJobSearchReports = () => request<JobSearchReport[]>('/job-search-reports')

export const getJobSearchReport = (reportDate: string) =>
    request<JobSearchReport>(`/job-search-reports/${encodeURIComponent(reportDate)}`)

export const getJobPosts = () => request<JobPost[]>('/job-posts')

export const getJobPost = (id: string) => request<JobPost>(`/job-posts/${encodeURIComponent(id)}`)

export const patchJobPost = (id: string, input: UpdateJobPostInput) =>
    request<JobPost>(`/job-posts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })
