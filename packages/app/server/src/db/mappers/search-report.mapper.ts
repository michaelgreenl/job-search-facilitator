import type { AgentLabel, JobRecommendation, ResumeType } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'

const recommendationSelect = {
    agentRank: true,
    agentLabel: true,
    fitRationale: true,
    applicationFlow: true,
    keyLegitimacySignals: true,
    recommendedResume: true,
    recommendedAction: true,
    legitimacyNotes: true,
} satisfies Prisma.JobSearchResultSelect

type PrismaRecommendation = Prisma.JobSearchResultGetPayload<{
    select: typeof recommendationSelect
}>

const agentLabelToApi = {
    TARGET: 'target',
    QUICK_APP: 'quick-app',
} satisfies Record<PrismaRecommendation['agentLabel'], AgentLabel>

const agentLabelToPrisma = {
    target: 'TARGET',
    'quick-app': 'QUICK_APP',
} satisfies Record<AgentLabel, PrismaRecommendation['agentLabel']>

const resumeTypeToApi = {
    FRONTEND: 'frontend',
    BACKEND_FULL_STACK: 'backend-full-stack',
    GENERAL: 'general',
} satisfies Record<PrismaRecommendation['recommendedResume'], ResumeType>

const resumeTypeToPrisma = {
    frontend: 'FRONTEND',
    'backend-full-stack': 'BACKEND_FULL_STACK',
    general: 'GENERAL',
} satisfies Record<ResumeType, PrismaRecommendation['recommendedResume']>

export const toJobRecommendation = (result: PrismaRecommendation): JobRecommendation => ({
    agentRank: result.agentRank,
    agentLabel: agentLabelToApi[result.agentLabel],
    fitRationale: result.fitRationale,
    applicationFlow: result.applicationFlow,
    keyLegitimacySignals: result.keyLegitimacySignals,
    recommendedResume: resumeTypeToApi[result.recommendedResume],
    recommendedAction: result.recommendedAction,
    legitimacyNotes: result.legitimacyNotes,
})

export const toPrismaAgentLabel = (agentLabel: AgentLabel) => agentLabelToPrisma[agentLabel]

export const toPrismaResumeType = (resumeType: ResumeType) => resumeTypeToPrisma[resumeType]
