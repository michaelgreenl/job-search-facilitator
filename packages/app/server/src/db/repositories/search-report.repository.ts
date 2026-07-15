import type {
    AgentLabel,
    JobSearchReport,
    ResumeType,
    UpsertJobSearchReportInput,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { toJobPost, toPrismaPostStatus } from '../mappers/job-post.mapper.ts'
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
type PrismaSearchResult = PrismaSearchReport['results'][number]

const agentLabelToApi = {
    TARGET: 'target',
    QUICK_APP: 'quick-app',
} satisfies Record<PrismaSearchResult['agentLabel'], AgentLabel>

const agentLabelToPrisma = {
    target: 'TARGET',
    'quick-app': 'QUICK_APP',
} satisfies Record<AgentLabel, PrismaSearchResult['agentLabel']>

const resumeTypeToApi = {
    FRONTEND: 'frontend',
    BACKEND_FULL_STACK: 'backend-full-stack',
    GENERAL: 'general',
} satisfies Record<PrismaSearchResult['recommendedResume'], ResumeType>

const resumeTypeToPrisma = {
    frontend: 'FRONTEND',
    'backend-full-stack': 'BACKEND_FULL_STACK',
    general: 'GENERAL',
} satisfies Record<ResumeType, PrismaSearchResult['recommendedResume']>

const toReportDate = (reportDate: string) => new Date(`${reportDate}T00:00:00.000Z`)

const toJobSearchReport = (report: PrismaSearchReport): JobSearchReport => ({
    id: report.id,
    reportDate: report.reportDate.toISOString().slice(0, 10),
    summary: report.summary,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    archivedAt: report.archivedAt?.toISOString() ?? null,
    results: report.results.map((result) => ({
        agentRank: result.agentRank,
        agentLabel: agentLabelToApi[result.agentLabel],
        fitRationale: result.fitRationale,
        applicationFlow: result.applicationFlow,
        keyLegitimacySignals: result.keyLegitimacySignals,
        recommendedResume: resumeTypeToApi[result.recommendedResume],
        recommendedAction: result.recommendedAction,
        legitimacyNotes: result.legitimacyNotes,
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
                const listingData = {
                    roleTitle: result.post.roleTitle,
                    company: result.post.company,
                    location: result.post.location,
                    compensation: result.post.compensation,
                    postSource: result.post.postSource,
                    applicationUrl: result.post.applicationUrl,
                    postStatus: toPrismaPostStatus(result.post.postStatus),
                }
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
                        agentLabel: agentLabelToPrisma[result.agentLabel],
                        fitRationale: result.fitRationale,
                        applicationFlow: result.applicationFlow,
                        keyLegitimacySignals: result.keyLegitimacySignals,
                        recommendedResume: resumeTypeToPrisma[result.recommendedResume],
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
