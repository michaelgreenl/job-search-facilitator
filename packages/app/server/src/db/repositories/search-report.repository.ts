import type { JobSearchReport, UpsertJobSearchReportInput } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { identityTokensForPost } from '../../job-post-identity.ts'
import {
    toJobPost,
    toJobPostSnapshot,
    toPrismaJobPostListingData,
} from '../mappers/job-post.mapper.ts'
import { lockJobPostIdentities } from '../lock-job-post-identities.ts'
import { toJobRecommendation, toPrismaAgentLabel } from '../mappers/search-report.mapper.ts'
import { prisma } from '../prisma.ts'

const reportInclude = {
    results: {
        include: { post: { include: { snapshot: true } } },
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
        jobPostSnapshot:
            result.post.snapshot === null ? null : toJobPostSnapshot(result.post.snapshot),
    })),
})

export interface SearchReportUpsertResult {
    report: JobSearchReport
    created: boolean
}

export interface SearchReportNetNewConflict {
    conflict: true
    conflictingSourceKeys: string[]
}

export type SearchReportNetNewUpsertResult = SearchReportUpsertResult | SearchReportNetNewConflict

export interface SearchReportRepository {
    findMany(): Promise<JobSearchReport[]>
    findById(reportId: string): Promise<JobSearchReport | null>
    upsertById(
        reportId: string,
        reportDate: string,
        input: UpsertJobSearchReportInput,
    ): Promise<SearchReportUpsertResult>
    upsertNetNewById(
        reportId: string,
        reportDate: string,
        input: UpsertJobSearchReportInput,
    ): Promise<SearchReportNetNewUpsertResult>
}

class NetNewPostRaceError extends Error {
    constructor(readonly sourceKey: string) {
        super('A guarded report post was inserted concurrently')
    }
}

const conflictingSourceKeys = (
    posts: UpsertJobSearchReportInput['results'][number]['post'][],
    reservedTokens: Set<string>,
): string[] => {
    const conflicts: string[] = []

    for (const post of posts) {
        const tokens = identityTokensForPost(post)

        if (tokens.some((token) => reservedTokens.has(token))) {
            conflicts.push(post.sourceKey)
        }

        tokens.forEach((token) => reservedTokens.add(token))
    }

    return conflicts
}

const persistReport = async (
    transaction: Prisma.TransactionClient,
    reportId: string,
    reportDate: string,
    input: UpsertJobSearchReportInput,
    sameReportSourceKeys?: ReadonlySet<string>,
): Promise<SearchReportUpsertResult> => {
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
        let post: { id: string }

        if (sameReportSourceKeys === undefined) {
            post = await transaction.jobPost.upsert({
                where: { sourceKey: result.post.sourceKey },
                create: {
                    sourceKey: result.post.sourceKey,
                    ...listingData,
                },
                update: listingData,
                select: { id: true },
            })
        } else if (sameReportSourceKeys.has(result.post.sourceKey)) {
            post = await transaction.jobPost.update({
                where: { sourceKey: result.post.sourceKey },
                data: listingData,
                select: { id: true },
            })
        } else {
            try {
                post = await transaction.jobPost.create({
                    data: {
                        sourceKey: result.post.sourceKey,
                        ...listingData,
                    },
                    select: { id: true },
                })
            } catch (error) {
                if (
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === 'P2002'
                ) {
                    throw new NetNewPostRaceError(result.post.sourceKey)
                }

                throw error
            }
        }

        await transaction.jobPostSnapshot.upsert({
            where: { jobPostId: post.id },
            create: {
                jobPostId: post.id,
                description: result.post.description,
                sourceUrl: result.post.postUrl,
                capturedAt: new Date(),
            },
            update: {
                description: result.post.description,
                sourceUrl: result.post.postUrl,
                capturedAt: new Date(),
            },
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
                recommendedResume: result.recommendedResume,
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
            await lockJobPostIdentities(
                transaction,
                input.results.map(({ post }) => post),
            )
            return persistReport(transaction, reportId, reportDate, input)
        })
    },

    async upsertNetNewById(reportId, reportDate, input) {
        try {
            return await prisma.$transaction(async (transaction) => {
                await lockJobPostIdentities(
                    transaction,
                    input.results.map(({ post }) => post),
                )
                const sourceKeys = input.results.map(({ post }) => post.sourceKey)
                const existingPosts = await transaction.jobPost.findMany({
                    select: {
                        sourceKey: true,
                        postUrl: true,
                        applicationUrl: true,
                        results: {
                            where: { reportId },
                            select: { reportId: true },
                        },
                    },
                })
                const sameReportSourceKeys = new Set(
                    existingPosts
                        .filter(({ results }) => results.length > 0)
                        .map(({ sourceKey }) => sourceKey),
                )
                const inputSourceKeys = new Set(sourceKeys)
                const reservedIdentityTokens = new Set(
                    existingPosts
                        .filter(
                            ({ sourceKey }) =>
                                !inputSourceKeys.has(sourceKey) ||
                                !sameReportSourceKeys.has(sourceKey),
                        )
                        .flatMap(identityTokensForPost),
                )
                const conflicts = conflictingSourceKeys(
                    input.results.map(({ post }) => post),
                    reservedIdentityTokens,
                )

                if (conflicts.length > 0) {
                    return { conflict: true as const, conflictingSourceKeys: conflicts }
                }

                return persistReport(transaction, reportId, reportDate, input, sameReportSourceKeys)
            })
        } catch (error) {
            if (error instanceof NetNewPostRaceError) {
                return { conflict: true, conflictingSourceKeys: [error.sourceKey] }
            }

            throw error
        }
    },
}
