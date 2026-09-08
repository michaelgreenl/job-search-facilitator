import type {
    AgentLabel,
    JobRecommendation,
    StandaloneJobRecommendation,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'

const standaloneRecommendationSelect = {
    agentLabel: true,
    fitRationale: true,
    applicationFlow: true,
    keyLegitimacySignals: true,
    recommendedResume: true,
    recommendedAction: true,
    legitimacyNotes: true,
} satisfies Prisma.UserAddedJobPostSelect

type PrismaStandaloneRecommendation = Prisma.UserAddedJobPostGetPayload<{
    select: typeof standaloneRecommendationSelect
}>

const recommendationSelect = {
    agentRank: true,
    ...standaloneRecommendationSelect,
} satisfies Prisma.JobSearchResultSelect

type PrismaRecommendation = Prisma.JobSearchResultGetPayload<{
    select: typeof recommendationSelect
}>

const agentLabelToApi = {
    TARGET: 'target',
    QUICK_APP: 'quick-app',
} satisfies Record<PrismaStandaloneRecommendation['agentLabel'], AgentLabel>

const agentLabelToPrisma = {
    target: 'TARGET',
    'quick-app': 'QUICK_APP',
} satisfies Record<AgentLabel, PrismaStandaloneRecommendation['agentLabel']>

export const toStandaloneJobRecommendation = (
    result: PrismaStandaloneRecommendation,
): StandaloneJobRecommendation => ({
    agentLabel: agentLabelToApi[result.agentLabel],
    fitRationale: result.fitRationale,
    applicationFlow: result.applicationFlow,
    keyLegitimacySignals: result.keyLegitimacySignals,
    recommendedResume: result.recommendedResume,
    recommendedAction: result.recommendedAction,
    legitimacyNotes: result.legitimacyNotes,
})

export const toJobRecommendation = (result: PrismaRecommendation): JobRecommendation => ({
    agentRank: result.agentRank,
    ...toStandaloneJobRecommendation(result),
})

export const toPrismaAgentLabel = (agentLabel: AgentLabel) => agentLabelToPrisma[agentLabel]
