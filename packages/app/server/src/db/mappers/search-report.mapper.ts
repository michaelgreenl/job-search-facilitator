import type {
    AgentLabel,
    JobRecommendation,
    ResumeType,
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

const resumeTypeToApi = {
    FRONTEND: 'frontend',
    BACKEND: 'backend',
    FULL_STACK: 'full-stack',
    BACKEND_FULL_STACK: 'backend-full-stack',
    GENERAL: 'general',
} satisfies Record<PrismaStandaloneRecommendation['recommendedResume'], ResumeType>

const resumeTypeToPrisma = {
    frontend: 'FRONTEND',
    backend: 'BACKEND',
    'full-stack': 'FULL_STACK',
    'backend-full-stack': 'BACKEND_FULL_STACK',
    general: 'GENERAL',
} satisfies Record<ResumeType, PrismaStandaloneRecommendation['recommendedResume']>

export const toStandaloneJobRecommendation = (
    result: PrismaStandaloneRecommendation,
): StandaloneJobRecommendation => ({
    agentLabel: agentLabelToApi[result.agentLabel],
    fitRationale: result.fitRationale,
    applicationFlow: result.applicationFlow,
    keyLegitimacySignals: result.keyLegitimacySignals,
    recommendedResume: resumeTypeToApi[result.recommendedResume],
    recommendedAction: result.recommendedAction,
    legitimacyNotes: result.legitimacyNotes,
})

export const toJobRecommendation = (result: PrismaRecommendation): JobRecommendation => ({
    agentRank: result.agentRank,
    ...toStandaloneJobRecommendation(result),
})

export const toPrismaAgentLabel = (agentLabel: AgentLabel) => agentLabelToPrisma[agentLabel]

export const toPrismaResumeType = (resumeType: ResumeType) => resumeTypeToPrisma[resumeType]
