import { parseJobSearchReport, parseJobSearchReports } from '@job-search-facilitator/core'
import { parseApiResponse } from '@/services/api-response'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

export async function fetchJobSearchReports() {
    const path = '/job-search-reports'
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseJobSearchReports, path)
}

export async function fetchJobSearchReport(reportId: string) {
    const path = `/job-search-reports/${encodeURIComponent(reportId)}`
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseJobSearchReport, path)
}
