import {
    parseJobSearchReport,
    parseJobSearchReports,
    type JobPost,
    type JobSearchReport,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { request } from '@/api'

const getJobSearchReports = () => request('/job-search-reports', parseJobSearchReports)

const getJobSearchReport = (reportId: string) =>
    request(`/job-search-reports/${encodeURIComponent(reportId)}`, parseJobSearchReport)

export const useReportStore = defineStore('reports', () => {
    const reports = ref<JobSearchReport[]>([])
    const loading = shallowRef(false)
    const error = shallowRef<string | null>(null)

    async function fetchReports() {
        loading.value = true
        error.value = null

        try {
            reports.value = await getJobSearchReports()
        } catch (requestError) {
            error.value = requestError instanceof Error ? requestError.message : 'Request failed'
            throw requestError
        } finally {
            loading.value = false
        }
    }

    async function fetchReport(reportId: string) {
        loading.value = true
        error.value = null

        try {
            const report = await getJobSearchReport(reportId)
            const index = reports.value.findIndex(({ id }) => id === report.id)

            if (index === -1) {
                reports.value.push(report)
            } else {
                reports.value[index] = report
            }

            return report
        } catch (requestError) {
            error.value = requestError instanceof Error ? requestError.message : 'Request failed'
            throw requestError
        } finally {
            loading.value = false
        }
    }

    function replacePost(post: JobPost) {
        for (const report of reports.value) {
            const result = report.results.find(({ post: current }) => current.id === post.id)

            if (result !== undefined) {
                result.post = post
            }
        }
    }

    return {
        reports,
        loading,
        error,
        fetchReports,
        fetchReport,
        replacePost,
    }
})
