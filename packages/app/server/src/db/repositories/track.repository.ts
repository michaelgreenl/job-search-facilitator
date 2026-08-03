import type {
    ApplicationArtifact,
    ApplyTrackingAutomationResult,
    JobNextStep,
    JobPostSnapshot,
    SaveJobNextStepInput,
    TrackedJobPost,
    TrackingActivity,
    TrackingActivitySource,
    TrackingActivityType,
    TrackingAutomationContext,
    TrackingAutomationObservation,
    TrackingAutomationResult,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import {
    toApiApplicationStatus,
    toJobPost,
    toPrismaApplicationStatus,
} from '../mappers/job-post.mapper.ts'
import { prisma } from '../prisma.ts'
import { trackedJobPostWhere } from './job-post.repository.ts'
import { toOutreachContact } from './outreach.repository.ts'

const trackedPostInclude = {
    outreachContacts: { where: { messaged: true }, orderBy: { updatedAt: 'desc' } },
    snapshot: true,
    applicationFiles: { orderBy: { position: 'asc' } },
    trackingActivities: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }] },
    nextStep: true,
} satisfies Prisma.JobPostInclude

type PrismaTrackedPost = Prisma.JobPostGetPayload<{ include: typeof trackedPostInclude }>
type PrismaSnapshot = Prisma.JobPostSnapshotGetPayload<object>
type PrismaArtifact = Prisma.ApplicationArtifactGetPayload<object>
type PrismaActivity = Prisma.TrackingActivityGetPayload<object>
type PrismaNextStep = Prisma.JobNextStepGetPayload<object>

const sourceToApi = {
    MANUAL: 'manual',
    GMAIL: 'gmail',
    LINKEDIN: 'linkedin',
    SYSTEM: 'system',
} satisfies Record<PrismaActivity['source'], TrackingActivitySource>

const sourceToPrisma = {
    manual: 'MANUAL',
    gmail: 'GMAIL',
    linkedin: 'LINKEDIN',
    system: 'SYSTEM',
} satisfies Record<TrackingActivitySource, PrismaActivity['source']>

const typeToApi = {
    APPLICATION_SUBMITTED: 'application-submitted',
    APPLICATION_ACKNOWLEDGED: 'application-acknowledged',
    APPLICATION_STATUS_CHANGED: 'application-status-changed',
    INTERVIEW_REQUESTED: 'interview-requested',
    INTERVIEW_SCHEDULED: 'interview-scheduled',
    REJECTION_RECEIVED: 'rejection-received',
    OFFER_RECEIVED: 'offer-received',
    OUTREACH_SENT: 'outreach-sent',
    OUTREACH_RESPONSE_RECEIVED: 'outreach-response-received',
    ACTION_REQUESTED: 'action-requested',
} satisfies Record<PrismaActivity['type'], TrackingActivityType>

const typeToPrisma = Object.fromEntries(
    Object.entries(typeToApi).map(([prismaType, apiType]) => [apiType, prismaType]),
) as Record<TrackingActivityType, PrismaActivity['type']>

const toSnapshot = (snapshot: PrismaSnapshot): JobPostSnapshot => ({
    jobPostId: snapshot.jobPostId,
    description: snapshot.description,
    sourceUrl: snapshot.sourceUrl,
    capturedAt: snapshot.capturedAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
})

const toArtifact = (artifact: PrismaArtifact): ApplicationArtifact => ({
    ...artifact,
    mediaType: artifact.mediaType as ApplicationArtifact['mediaType'],
    capturedAt: artifact.capturedAt.toISOString(),
    createdAt: artifact.createdAt.toISOString(),
})

const toActivity = (activity: PrismaActivity): TrackingActivity => ({
    ...activity,
    type: typeToApi[activity.type],
    source: sourceToApi[activity.source],
    applicationStatus:
        activity.applicationStatus === null
            ? null
            : toApiApplicationStatus(activity.applicationStatus),
    occurredAt: activity.occurredAt.toISOString(),
    createdAt: activity.createdAt.toISOString(),
})

const toNextStep = (nextStep: PrismaNextStep): JobNextStep => ({
    ...nextStep,
    dueAt: nextStep.dueAt.toISOString(),
    completedAt: nextStep.completedAt?.toISOString() ?? null,
    createdAt: nextStep.createdAt.toISOString(),
    updatedAt: nextStep.updatedAt.toISOString(),
})

const toTrackedPost = (post: PrismaTrackedPost): TrackedJobPost => {
    const responded = new Set(
        post.trackingActivities
            .filter(({ type }) => type === 'OUTREACH_RESPONSE_RECEIVED')
            .map(({ outreachContactId }) => outreachContactId),
    )

    return {
        post: toJobPost(post),
        contacts: post.outreachContacts.map((contact) => ({
            ...toOutreachContact(contact),
            status: responded.has(contact.id) ? 'responded' : 'response-pending',
        })),
        snapshot: post.snapshot === null ? null : toSnapshot(post.snapshot),
        applicationArtifacts: post.applicationFiles.map(toArtifact),
        activities: post.trackingActivities.map(toActivity),
        nextStep: post.nextStep === null ? null : toNextStep(post.nextStep),
    }
}

const derivedStatus = (observation: TrackingAutomationObservation) => {
    if (
        observation.type === 'application-submitted' ||
        observation.type === 'application-acknowledged'
    ) {
        return 'awaiting-response' as const
    }

    if (observation.type === 'interview-requested' || observation.type === 'interview-scheduled') {
        return 'interviewing' as const
    }

    if (observation.type === 'rejection-received') {
        return 'rejected' as const
    }

    if (observation.type === 'outreach-sent' || observation.type === 'outreach-response-received') {
        return null
    }

    return observation.applicationStatus
}

export interface TrackRepository {
    findTracked(): Promise<TrackedJobPost[]>
    findAutomationContext(): Promise<TrackingAutomationContext>
    saveNextStep(jobPostId: string, input: SaveJobNextStepInput): Promise<JobNextStep | null>
    applyAutomationResult(
        input: TrackingAutomationResult,
    ): Promise<ApplyTrackingAutomationResult | null>
}

export const trackRepository: TrackRepository = {
    async findTracked() {
        const posts = await prisma.jobPost.findMany({
            where: trackedJobPostWhere,
            include: trackedPostInclude,
            orderBy: { updatedAt: 'desc' },
        })

        return posts.map(toTrackedPost)
    },

    async findAutomationContext() {
        const posts = await trackRepository.findTracked()

        return {
            requestedAt: new Date().toISOString(),
            posts: posts.map(({ post, contacts, activities }) => ({
                id: post.id,
                company: post.company,
                roleTitle: post.roleTitle,
                postUrl: post.postUrl,
                applicationUrl: post.applicationUrl,
                applicationStatus: post.applicationStatus,
                eligibleSince: [
                    ...(post.applicationStatus === 'not-applied' ? [] : [post.updatedAt]),
                    ...contacts.map(({ updatedAt }) => updatedAt),
                ].sort()[0]!,
                lastObservedAt: {
                    gmail: activities.find(({ source }) => source === 'gmail')?.occurredAt ?? null,
                    linkedin:
                        activities.find(({ source }) => source === 'linkedin')?.occurredAt ?? null,
                },
                contacts: contacts.map((contact) => ({
                    id: contact.id,
                    personName: contact.personName,
                    personTitle: contact.personTitle,
                    profileUrl: contact.profileUrl,
                    messagedAt: contact.updatedAt,
                    status: contact.status,
                })),
            })),
        }
    },

    async saveNextStep(jobPostId, input) {
        const data = {
            ...input,
            dueAt: new Date(input.dueAt),
            completedAt: input.completedAt === null ? null : new Date(input.completedAt),
        }

        try {
            return toNextStep(
                await prisma.jobNextStep.upsert({
                    where: { jobPostId },
                    create: { jobPostId, ...data },
                    update: data,
                }),
            )
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
                return null
            }
            throw error
        }
    },

    async applyAutomationResult(input) {
        return prisma.$transaction(async (transaction) => {
            const jobPostIds = [
                ...new Set([
                    ...input.observations.map(({ jobPostId }) => jobPostId),
                    ...input.nextSteps.map(({ jobPostId }) => jobPostId),
                ]),
            ]
            const eligiblePosts = await transaction.jobPost.findMany({
                where: { id: { in: jobPostIds }, AND: trackedJobPostWhere },
                select: {
                    id: true,
                    outreachContacts: { where: { messaged: true }, select: { id: true } },
                },
            })
            const contacts = new Map(
                eligiblePosts.flatMap((post) =>
                    post.outreachContacts.map((contact) => [contact.id, post.id] as const),
                ),
            )

            if (
                eligiblePosts.length !== jobPostIds.length ||
                input.observations.some(
                    ({ jobPostId, outreachContactId }) =>
                        outreachContactId !== null && contacts.get(outreachContactId) !== jobPostId,
                )
            ) {
                return null
            }

            const inserted = await transaction.trackingActivity.createMany({
                data: input.observations.map((observation) => {
                    const applicationStatus = derivedStatus(observation)

                    return {
                        jobPostId: observation.jobPostId,
                        outreachContactId: observation.outreachContactId,
                        type: typeToPrisma[observation.type],
                        applicationStatus:
                            applicationStatus === null
                                ? null
                                : toPrismaApplicationStatus(applicationStatus),
                        source: sourceToPrisma[observation.source],
                        externalId: observation.externalId,
                        summary: observation.summary,
                        sourceUrl: observation.sourceUrl,
                        occurredAt: new Date(observation.occurredAt),
                    }
                }),
                skipDuplicates: true,
            })

            for (const jobPostId of new Set(
                input.observations
                    .filter((observation) => derivedStatus(observation) !== null)
                    .map(({ jobPostId }) => jobPostId),
            )) {
                const latest = await transaction.trackingActivity.findFirst({
                    where: { jobPostId, applicationStatus: { not: null } },
                    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
                })

                if (latest !== null && latest.applicationStatus !== null) {
                    await transaction.jobPost.update({
                        where: { id: jobPostId },
                        data: { applicationStatus: latest.applicationStatus },
                    })
                }
            }

            for (const nextStep of input.nextSteps) {
                const dueAt = new Date(nextStep.dueAt)
                const current = await transaction.jobNextStep.findUnique({
                    where: { jobPostId: nextStep.jobPostId },
                })

                if (
                    current?.title === nextStep.title &&
                    current.dueAt.getTime() === dueAt.getTime()
                ) {
                    continue
                }

                const sourceActivity =
                    nextStep.source === null
                        ? null
                        : await transaction.trackingActivity.findFirst({
                              where: {
                                  jobPostId: nextStep.jobPostId,
                                  source: sourceToPrisma[nextStep.source.source],
                                  externalId: nextStep.source.externalId,
                                  type: typeToPrisma[nextStep.source.type],
                              },
                          })

                await transaction.jobNextStep.upsert({
                    where: { jobPostId: nextStep.jobPostId },
                    create: {
                        jobPostId: nextStep.jobPostId,
                        title: nextStep.title,
                        dueAt,
                        sourceActivityId: sourceActivity?.id ?? null,
                    },
                    update: {
                        title: nextStep.title,
                        dueAt,
                        completedAt: null,
                        sourceActivityId: sourceActivity?.id ?? null,
                    },
                })
            }

            return { createdActivities: inserted.count }
        })
    },
}
