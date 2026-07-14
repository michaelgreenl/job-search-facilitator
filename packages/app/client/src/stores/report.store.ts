import type { JobPost, JobSearchReport } from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { getJobSearchReport, getJobSearchReports } from '@/api'

export const useReportStore = defineStore('reports', {
    state: () => ({
        reports: [] as JobSearchReport[],
        loading: false,
        error: null as string | null,
    }),
    actions: {
        async fetchReports() {
            this.loading = true
            this.error = null

            try {
                this.reports = await getJobSearchReports()
            } catch (error) {
                this.error = error instanceof Error ? error.message : 'Request failed'
                throw error
            } finally {
                this.loading = false
            }
        },
        async fetchReport(reportDate: string) {
            this.loading = true
            this.error = null

            try {
                const report = await getJobSearchReport(reportDate)
                const index = this.reports.findIndex(({ id }) => id === report.id)

                if (index === -1) {
                    this.reports.push(report)
                } else {
                    this.reports[index] = report
                }

                return report
            } catch (error) {
                this.error = error instanceof Error ? error.message : 'Request failed'
                throw error
            } finally {
                this.loading = false
            }
        },
        replacePost(post: JobPost) {
            for (const report of this.reports) {
                const result = report.results.find(({ post: current }) => current.id === post.id)

                if (result !== undefined) {
                    result.post = post
                }
            }
        },
    },
})
