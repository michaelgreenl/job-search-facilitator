import { AgentLabel, ResumeType, type Prisma } from '../../src/generated/prisma/client.ts'
import { jobPostSeeds } from '../seeders/job-posts.ts'

interface SearchResultSeed {
    sourceKey: string
    agentRank: number
    agentLabel: AgentLabel
    fitRationale: string
    applicationFlow: string
    keyLegitimacySignals: string
    recommendedResume: ResumeType
    recommendedAction: string
    legitimacyNotes: string | null
}

interface SearchReportSeed {
    id: string
    reportDate: Date
    summary: string
    results: SearchResultSeed[]
}

const evaluationFocuses = [
    'strong Vue and component architecture overlap',
    'balanced TypeScript product and API work',
    'direct Node.js service and PostgreSQL experience',
    'relevant frontend platform ownership',
    'useful tooling and developer workflow depth',
    'close product delivery and customer collaboration fit',
    'strong API design and service reliability alignment',
    'direct reusable UI and accessibility experience',
    'relevant browser performance measurement work',
    'practical automation and internal platform experience',
    'strong accessible interface engineering overlap',
    'broad TypeScript application delivery experience',
] as const

const resumeTypes = [
    ResumeType.FRONTEND,
    ResumeType.BACKEND_FULL_STACK,
    ResumeType.BACKEND_FULL_STACK,
    ResumeType.FRONTEND,
    ResumeType.GENERAL,
    ResumeType.GENERAL,
    ResumeType.BACKEND_FULL_STACK,
    ResumeType.FRONTEND,
    ResumeType.FRONTEND,
    ResumeType.BACKEND_FULL_STACK,
    ResumeType.FRONTEND,
    ResumeType.GENERAL,
] as const

const buildResults = (postIndexes: readonly number[], reportVersion: 1 | 2): SearchResultSeed[] =>
    postIndexes.map((postIndex, rankIndex) => {
        const post = jobPostSeeds[postIndex]
        const evaluationFocus = evaluationFocuses[postIndex]
        const recommendedResume = resumeTypes[postIndex]

        if (
            post === undefined ||
            evaluationFocus === undefined ||
            recommendedResume === undefined
        ) {
            throw new Error(`Missing seed evaluation for post index ${postIndex}`)
        }

        const quickApplication = (rankIndex + reportVersion) % 4 === 0

        return {
            sourceKey: post.sourceKey,
            agentRank: rankIndex + 1,
            agentLabel: quickApplication ? AgentLabel.QUICK_APP : AgentLabel.TARGET,
            fitRationale:
                reportVersion === 1
                    ? `${post.roleTitle}: ${evaluationFocus}.`
                    : `${evaluationFocus}; refreshed listing details remain promising.`,
            applicationFlow:
                post.postSource === 'Example Careers'
                    ? 'Direct company application.'
                    : 'External job-board application.',
            keyLegitimacySignals: 'Named company, specific role, and public application URL.',
            recommendedResume:
                reportVersion === 2 && postIndex % 5 === 0 ? ResumeType.GENERAL : recommendedResume,
            recommendedAction: quickApplication
                ? 'Use the concise application path.'
                : reportVersion === 1
                  ? 'Tailor the resume and apply.'
                  : 'Review the refreshed listing, then apply.',
            legitimacyNotes:
                (postIndex + reportVersion) % 5 === 0
                    ? 'Example-domain listing for development data only.'
                    : null,
        }
    })

export const searchReportSeeds: readonly SearchReportSeed[] = [
    {
        id: '00000000-0000-4000-8000-000000000001',
        reportDate: new Date('2026-07-01T00:00:00.000Z'),
        summary: 'Ten focused example opportunities spanning frontend, platform, and product work.',
        results: buildResults([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 1),
    },
    {
        id: '00000000-0000-4000-8000-000000000002',
        reportDate: new Date('2026-07-08T00:00:00.000Z'),
        summary:
            'Twelve refreshed example opportunities with broader accessibility and TypeScript coverage.',
        results: buildResults([2, 0, 4, 1, 6, 3, 8, 5, 10, 7, 11, 9], 2),
    },
]

const toResultCreate = (
    reportId: string,
    result: SearchResultSeed,
    postIds: ReadonlyMap<string, string>,
): Prisma.JobSearchResultCreateManyInput => {
    const postId = postIds.get(result.sourceKey)

    if (postId === undefined) {
        throw new Error(`Missing seeded post ${result.sourceKey}`)
    }

    return {
        reportId,
        postId,
        agentRank: result.agentRank,
        agentLabel: result.agentLabel,
        fitRationale: result.fitRationale,
        applicationFlow: result.applicationFlow,
        keyLegitimacySignals: result.keyLegitimacySignals,
        recommendedResume: result.recommendedResume,
        recommendedAction: result.recommendedAction,
        legitimacyNotes: result.legitimacyNotes,
    }
}

export const seedSearchReports = async (
    transaction: Prisma.TransactionClient,
    postIds: ReadonlyMap<string, string>,
): Promise<void> => {
    for (const report of searchReportSeeds) {
        const savedReport = await transaction.jobSearchReport.upsert({
            where: { id: report.id },
            create: {
                id: report.id,
                reportDate: report.reportDate,
                summary: report.summary,
            },
            update: { summary: report.summary },
            select: { id: true },
        })

        await transaction.jobSearchResult.deleteMany({
            where: { reportId: savedReport.id },
        })
        await transaction.jobSearchResult.createMany({
            data: report.results.map((result) => toResultCreate(savedReport.id, result, postIds)),
        })
    }
}
