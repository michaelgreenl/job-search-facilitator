import { parseJobSearchReport, parseJobSearchReports } from '@job-search-facilitator/core'
import { apiUrl, parseApiResponse } from '@/api'

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
