import type {
    JobUpdate,
    JobUpdateCheckContext,
    JobUpdateCheckResult,
    ObservedApplicationStatus,
    SavedJobUpdates,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { activitySourceToPrisma } from '../mappers/job-post-activity.mapper.ts'
import { toPrismaApplicationStatus } from '../mappers/job-post.mapper.ts'
import { prisma } from '../prisma.ts'

type DatabaseApplicationStatus = Prisma.JobPostGetPayload<object>['applicationStatus']

const applicationActivityType = {
    'awaiting-response': 'APPLICATION_ACKNOWLEDGED',
    interviewing: 'INTERVIEW_REQUESTED',
    rejected: 'REJECTION_RECEIVED',
    hired: 'HIRING_CONFIRMED',
} as const

const allowedPriorStatuses: Record<ObservedApplicationStatus, DatabaseApplicationStatus[]> = {
    'awaiting-response': [],
    interviewing: ['AWAITING_RESPONSE'],
    rejected: ['AWAITING_RESPONSE', 'INTERVIEWING'],
    hired: ['AWAITING_RESPONSE', 'INTERVIEWING'],
}

const updateKey = (update: JobUpdate) =>
    `${activitySourceToPrisma[update.source]}:${update.externalId}`

const activityData = (update: JobUpdate): Prisma.JobPostActivityCreateManyInput => ({
    jobPostId: update.jobPostId,
    outreachContactId: update.kind === 'application-status' ? null : update.outreachContactId,
    type:
        update.kind === 'application-status'
            ? applicationActivityType[update.status]
            : update.kind === 'outreach-response'
              ? 'OUTREACH_RESPONSE_RECEIVED'
              : 'REVIEW_NEEDED',
    source: activitySourceToPrisma[update.source],
    externalId: update.externalId,
    summary: update.summary,
    sourceUrl: update.sourceUrl,
    occurredAt: new Date(update.occurredAt),
})

const suggestNextStep = async (
    transaction: Prisma.TransactionClient,
    jobPostId: string,
    title: string,
    dueAt: Date,
) => {
    await transaction.jobPost.updateMany({
        where: {
            id: jobPostId,
            OR: [
                { nextStepTitle: null },
                {
                    nextStepSource: 'AUTOMATION',
                    nextStepCompletedAt: null,
                    nextStepDueAt: { lt: dueAt },
                },
                { nextStepCompletedAt: { lt: dueAt } },
            ],
        },
        data: {
            nextStepTitle: title,
            nextStepDueAt: dueAt,
            nextStepCompletedAt: null,
            nextStepSource: 'AUTOMATION',
        },
    })
}

export interface JobUpdateCheckRepository {
    getContext(): Promise<JobUpdateCheckContext>
    save(result: JobUpdateCheckResult): Promise<SavedJobUpdates>
}

export const jobUpdateCheckRepository: JobUpdateCheckRepository = {
    async getContext() {
        const posts = await prisma.jobPost.findMany({
            where: {
                OR: [
                    {
                        applicationStatus: { in: ['AWAITING_RESPONSE', 'INTERVIEWING'] },
                        appliedAt: { not: null },
                    },
                    {
                        outreachContacts: {
                            some: { messaged: true, respondedAt: null, messagedAt: { not: null } },
                        },
                    },
                ],
            },
            select: {
                id: true,
                company: true,
                roleTitle: true,
                postUrl: true,
                applicationUrl: true,
                applicationStatus: true,
                appliedAt: true,
                outreachContacts: {
                    where: { messaged: true, respondedAt: null, messagedAt: { not: null } },
                    select: {
                        id: true,
                        personName: true,
                        personTitle: true,
                        profileUrl: true,
                        messagedAt: true,
                    },
                },
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        })

        return {
            posts: posts.flatMap((post) => {
                const application =
                    post.appliedAt !== null &&
                    (post.applicationStatus === 'AWAITING_RESPONSE' ||
                        post.applicationStatus === 'INTERVIEWING')
                        ? {
                              status:
                                  post.applicationStatus === 'AWAITING_RESPONSE'
                                      ? ('awaiting-response' as const)
                                      : ('interviewing' as const),
                              url: post.applicationUrl,
                              appliedAt: post.appliedAt.toISOString(),
                          }
                        : null
                const contacts = post.outreachContacts.flatMap((contact) =>
                    contact.messagedAt === null
                        ? []
                        : [
                              {
                                  id: contact.id,
                                  personName: contact.personName,
                                  personTitle: contact.personTitle,
                                  profileUrl: contact.profileUrl,
                                  messagedAt: contact.messagedAt.toISOString(),
                              },
                          ],
                )

                return application === null && contacts.length === 0
                    ? []
                    : [
                          {
                              id: post.id,
                              company: post.company,
                              roleTitle: post.roleTitle,
                              postUrl: post.postUrl,
                              application,
                              contacts,
                          },
                      ]
            }),
        }
    },

    async save(result) {
        const uniqueUpdates = [
            ...new Map(result.updates.map((update) => [updateKey(update), update])).values(),
        ]

        if (uniqueUpdates.length === 0) {
            return { createdActivities: 0 }
        }

        return prisma.$transaction(async (transaction) => {
            const jobPostIds = [...new Set(uniqueUpdates.map(({ jobPostId }) => jobPostId))]
            const posts = await transaction.jobPost.findMany({
                where: { id: { in: jobPostIds } },
                select: {
                    id: true,
                    company: true,
                    applicationStatus: true,
                    appliedAt: true,
                    applicationStatusUpdatedAt: true,
                    outreachContacts: {
                        where: { messaged: true, respondedAt: null, messagedAt: { not: null } },
                        select: {
                            id: true,
                            personName: true,
                            messagedAt: true,
                            responseStatusUpdatedAt: true,
                        },
                    },
                },
            })
            const postsById = new Map(posts.map((post) => [post.id, post]))
            const contactsById = new Map(
                posts.flatMap((post) =>
                    post.outreachContacts.map(
                        (contact) => [contact.id, { ...contact, jobPostId: post.id }] as const,
                    ),
                ),
            )
            const latestEvidenceTime = Date.now() + 5 * 60 * 1_000
            const currentUpdates = uniqueUpdates.filter((update) => {
                const post = postsById.get(update.jobPostId)
                const occurredAt = Date.parse(update.occurredAt)

                if (post === undefined || occurredAt > latestEvidenceTime) {
                    return false
                }

                const isCurrentApplicationEvidence =
                    post.appliedAt !== null &&
                    (post.applicationStatus === 'AWAITING_RESPONSE' ||
                        post.applicationStatus === 'INTERVIEWING') &&
                    occurredAt >= post.appliedAt.getTime() &&
                    (post.applicationStatusUpdatedAt === null ||
                        occurredAt > post.applicationStatusUpdatedAt.getTime())

                if (update.kind === 'application-status') {
                    return isCurrentApplicationEvidence
                }

                if (update.outreachContactId === null) {
                    return (
                        isCurrentApplicationEvidence ||
                        post.outreachContacts.some(
                            ({ messagedAt, responseStatusUpdatedAt }) =>
                                messagedAt !== null &&
                                occurredAt >= messagedAt.getTime() &&
                                (responseStatusUpdatedAt === null ||
                                    occurredAt > responseStatusUpdatedAt.getTime()),
                        )
                    )
                }

                const contact = contactsById.get(update.outreachContactId)
                return (
                    contact !== undefined &&
                    contact.jobPostId === update.jobPostId &&
                    contact.messagedAt !== null &&
                    occurredAt >= contact.messagedAt.getTime() &&
                    (contact.responseStatusUpdatedAt === null ||
                        occurredAt > contact.responseStatusUpdatedAt.getTime())
                )
            })

            if (currentUpdates.length === 0) {
                return { createdActivities: 0 }
            }

            const existingActivities = await transaction.jobPostActivity.findMany({
                where: {
                    OR: currentUpdates.map((update) => ({
                        source: activitySourceToPrisma[update.source],
                        externalId: update.externalId,
                    })),
                },
                select: { source: true, externalId: true },
            })
            const existingKeys = new Set(
                existingActivities.map(({ source, externalId }) => `${source}:${externalId}`),
            )
            const newUpdates = currentUpdates.filter(
                (update) => !existingKeys.has(updateKey(update)),
            )

            if (newUpdates.length === 0) {
                return { createdActivities: 0 }
            }

            const inserted = await transaction.jobPostActivity.createManyAndReturn({
                data: newUpdates.map(activityData),
                skipDuplicates: true,
                select: { source: true, externalId: true },
            })
            const insertedKeys = new Set(
                inserted.map(({ source, externalId }) => `${source}:${externalId}`),
            )
            const insertedUpdates = newUpdates.filter((update) =>
                insertedKeys.has(updateKey(update)),
            )

            for (const update of insertedUpdates.sort(
                (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
            )) {
                const occurredAt = new Date(update.occurredAt)
                const post = postsById.get(update.jobPostId)!

                if (update.kind === 'application-status') {
                    const priorStatuses = allowedPriorStatuses[update.status]

                    if (priorStatuses.length === 0) {
                        continue
                    }

                    const changed = await transaction.jobPost.updateMany({
                        where: {
                            id: post.id,
                            applicationStatus: { in: priorStatuses },
                            OR: [
                                { applicationStatusUpdatedAt: null },
                                { applicationStatusUpdatedAt: { lt: occurredAt } },
                            ],
                        },
                        data: {
                            applicationStatus: toPrismaApplicationStatus(update.status),
                            applicationStatusUpdatedAt: occurredAt,
                        },
                    })

                    if (changed.count === 1 && update.status === 'interviewing') {
                        await suggestNextStep(
                            transaction,
                            post.id,
                            `Prepare for ${post.company} interview`,
                            occurredAt,
                        )
                    } else if (
                        changed.count === 1 &&
                        (update.status === 'rejected' || update.status === 'hired')
                    ) {
                        await transaction.jobPost.updateMany({
                            where: {
                                id: post.id,
                                nextStepSource: 'AUTOMATION',
                                nextStepCompletedAt: null,
                            },
                            data: { nextStepCompletedAt: occurredAt },
                        })
                    }
                } else if (update.kind === 'outreach-response') {
                    const contact = contactsById.get(update.outreachContactId)!
                    const changed = await transaction.outreachContact.updateMany({
                        where: {
                            id: contact.id,
                            jobPostId: post.id,
                            messaged: true,
                            respondedAt: null,
                            OR: [
                                { responseStatusUpdatedAt: null },
                                { responseStatusUpdatedAt: { lt: occurredAt } },
                            ],
                        },
                        data: { respondedAt: occurredAt, responseStatusUpdatedAt: occurredAt },
                    })

                    if (changed.count === 1) {
                        await suggestNextStep(
                            transaction,
                            post.id,
                            `Reply to ${contact.personName}`,
                            occurredAt,
                        )
                    }
                } else {
                    await suggestNextStep(
                        transaction,
                        post.id,
                        `Review possible update from ${post.company}`,
                        occurredAt,
                    )
                }
            }

            return { createdActivities: inserted.length }
        })
    },
}
