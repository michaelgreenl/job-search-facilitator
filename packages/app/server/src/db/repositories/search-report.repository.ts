import type { JobSearchReport, UpsertJobSearchReportInput } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { toJobPost, toPrismaJobPostListingData } from '../mappers/job-post.mapper.ts'
import {
    toJobRecommendation,
    toPrismaAgentLabel,
    toPrismaResumeType,
} from '../mappers/search-report.mapper.ts'
import { prisma } from '../prisma.ts'

const reportInclude = {
    results: {
        include: { post: true },
        orderBy: { agentRank: 'asc' },
    },
} satisfies Prisma.JobSearchReportInclude

type PrismaSearchReport = Prisma.JobSearchReportGetPayload<{
    include: typeof reportInclude
}>
const toReportDate = (reportDate: string) => new Date(`${reportDate}T00:00:00.000Z`)

const toJobSearchReport = (report: PrismaSearchReport): JobSearchReport => ({
    id: report.id,
    reportDate: report.reportDate.toISOString().slice(0, 10),
    summary: report.summary,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    archivedAt: report.archivedAt?.toISOString() ?? null,
    results: report.results.map((result) => ({
        ...toJobRecommendation(result),
        post: toJobPost(result.post),
    })),
})

export interface SearchReportUpsertResult {
    report: JobSearchReport
    created: boolean
}

export interface SearchReportRepository {
    findMany(): Promise<JobSearchReport[]>
    findById(reportId: string): Promise<JobSearchReport | null>
    upsertById(
        reportId: string,
        reportDate: string,
        input: UpsertJobSearchReportInput,
    ): Promise<SearchReportUpsertResult>
}

export const searchReportRepository: SearchReportRepository = {
    async findMany() {
        const reports = await prisma.jobSearchReport.findMany({
            include: reportInclude,
            orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        })

        return reports.map(toJobSearchReport)
    },

    async findById(reportId) {
        const report = await prisma.jobSearchReport.findUnique({
            where: { id: reportId },
            include: reportInclude,
        })

        return report === null ? null : toJobSearchReport(report)
    },

    async upsertById(reportId, reportDate, input) {
        return prisma.$transaction(async (transaction) => {
            const date = toReportDate(reportDate)
            const insertedReport = await transaction.jobSearchReport.createMany({
                data: { id: reportId, reportDate: date, summary: input.summary },
                skipDuplicates: true,
            })
            const report = await transaction.jobSearchReport.update({
                where: { id: reportId },
                data: { summary: input.summary },
                select: { id: true },
            })

            await transaction.jobSearchResult.deleteMany({
                where: { reportId: report.id },
            })

            for (const result of input.results) {
                // Report ingestion refreshes canonical listing facts, but not user-owned post state.
                const listingData = toPrismaJobPostListingData(result.post)
                const post = await transaction.jobPost.upsert({
                    where: { sourceKey: result.post.sourceKey },
                    create: {
                        sourceKey: result.post.sourceKey,
                        ...listingData,
                    },
                    update: listingData,
                    select: { id: true },
                })

                await transaction.jobSearchResult.create({
                    data: {
                        reportId: report.id,
                        postId: post.id,
                        agentRank: result.agentRank,
                        agentLabel: toPrismaAgentLabel(result.agentLabel),
                        fitRationale: result.fitRationale,
                        applicationFlow: result.applicationFlow,
                        keyLegitimacySignals: result.keyLegitimacySignals,
                        recommendedResume: toPrismaResumeType(result.recommendedResume),
                        recommendedAction: result.recommendedAction,
                        legitimacyNotes: result.legitimacyNotes,
                    },
                })
            }

            const savedReport = await transaction.jobSearchReport.findUniqueOrThrow({
                where: { id: report.id },
                include: reportInclude,
            })

            return {
                report: toJobSearchReport(savedReport),
                created: insertedReport.count === 1,
            }
        })
    },
}
