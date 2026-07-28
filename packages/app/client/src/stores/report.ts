import {
    parseJobSearchReport,
    parseJobSearchReports,
    type JobSearchReport,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { request } from '@/api'
import { usePostStore } from '@/stores/post'

const getJobSearchReports = () => request('/job-search-reports', parseJobSearchReports)

const getJobSearchReport = (reportId: string) =>
    request(`/job-search-reports/${encodeURIComponent(reportId)}`, parseJobSearchReport)

export const useReportStore = defineStore('reports', () => {
    const postStore = usePostStore()
    const reports = ref<JobSearchReport[]>([])
    const loading = shallowRef(false)
    const error = shallowRef<string | null>(null)

    function canonicalizeReportPosts(report: JobSearchReport) {
        for (const result of report.results) {
            result.post = postStore.upsertPost(result.post)
        }

        return report
    }

    async function fetchReports() {
        loading.value = true
        error.value = null

        try {
            reports.value = (await getJobSearchReports()).map(canonicalizeReportPosts)
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
            const report = canonicalizeReportPosts(await getJobSearchReport(reportId))
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

    return {
        reports,
        loading,
        error,
        fetchReports,
        fetchReport,
    }
})
