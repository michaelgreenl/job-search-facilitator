import type {
    CreateOutreachRunInput,
    OutreachContact,
    OutreachContactInput,
    OutreachRun,
    OutreachRunStatus,
    UpdateOutreachContactInput,
    UpdateOutreachRunInput,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { toOutreachContact } from '../mappers/outreach.mapper.ts'
import { prisma } from '../prisma.ts'

type PrismaOutreachRun = Prisma.OutreachRunGetPayload<object>

const statusToApi = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
} satisfies Record<PrismaOutreachRun['status'], OutreachRunStatus>

const toOutreachRun = (run: PrismaOutreachRun): OutreachRun => ({
    id: run.id,
    jobPostId: run.jobPostId,
    requestedContactCount: run.requestedContactCount as OutreachRun['requestedContactCount'],
    status: statusToApi[run.status],
    agentTaskId: run.agentTaskId,
    agentThreadId: run.agentThreadId,
    agentTurnId: run.agentTurnId,
    error: run.error,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
})

export interface OutreachContactRepository {
    create(jobPostId: string, input: OutreachContactInput): Promise<OutreachContact | null>
    findByJobPostId(jobPostId: string): Promise<OutreachContact[]>
    update(
        jobPostId: string,
        contactId: string,
        input: UpdateOutreachContactInput,
    ): Promise<OutreachContact | null>
}

export interface OutreachRunRepository {
    create(input: CreateOutreachRunInput): Promise<OutreachRun | null>
    findById(id: string): Promise<OutreachRun | null>
    update(id: string, input: UpdateOutreachRunInput): Promise<OutreachRun | null>
}

export const outreachContactRepository: OutreachContactRepository = {
    async create(jobPostId, input) {
        try {
            const contact = await prisma.outreachContact.create({
                data: { jobPostId, ...input },
            })

            return toOutreachContact(contact)
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
                return null
            }

            throw error
        }
    },

    async findByJobPostId(jobPostId) {
        const contacts = await prisma.outreachContact.findMany({
            where: { jobPostId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })

        return contacts.map(toOutreachContact)
    },

    async update(jobPostId, contactId, input) {
        try {
            return await prisma.$transaction(async (transaction) => {
                const existing = await transaction.outreachContact.findUnique({
                    where: { id: contactId, jobPostId },
                })

                if (existing === null) {
                    return null
                }

                const now = new Date()
                const messaged = input.responded === true ? true : input.messaged
                const data: Prisma.OutreachContactUpdateInput = {}

                if (messaged !== undefined) {
                    data.messaged = messaged
                    data.messagedAt = messaged ? (existing.messagedAt ?? now) : null

                    if (!messaged) {
                        data.respondedAt = null
                        data.responseStatusUpdatedAt = now
                    } else if (!existing.messaged) {
                        data.responseStatusUpdatedAt = now
                    }
                }

                if (input.responded !== undefined) {
                    data.respondedAt = input.responded ? now : null
                    data.responseStatusUpdatedAt = now
                }

                const contact = await transaction.outreachContact.update({
                    where: { id: contactId, jobPostId },
                    data,
                })

                const manualActivityTypes: Array<'OUTREACH_SENT' | 'OUTREACH_RESPONSE_RECEIVED'> =
                    !contact.messaged || !existing.messaged
                        ? ['OUTREACH_SENT', 'OUTREACH_RESPONSE_RECEIVED']
                        : contact.respondedAt === null || existing.respondedAt === null
                          ? ['OUTREACH_RESPONSE_RECEIVED']
                          : []

                if (manualActivityTypes.length > 0) {
                    await transaction.jobPostActivity.deleteMany({
                        where: {
                            jobPostId,
                            outreachContactId: contactId,
                            source: 'MANUAL',
                            type: { in: manualActivityTypes },
                        },
                    })
                }

                if (!existing.messaged && contact.messaged) {
                    await transaction.jobPostActivity.create({
                        data: {
                            jobPostId,
                            outreachContactId: contactId,
                            type: 'OUTREACH_SENT',
                            source: 'MANUAL',
                            summary: `Messaged ${contact.personName}`,
                            sourceUrl: contact.profileUrl,
                            occurredAt: now,
                        },
                    })
                }

                if (existing.respondedAt === null && contact.respondedAt !== null) {
                    await transaction.jobPostActivity.create({
                        data: {
                            jobPostId,
                            outreachContactId: contactId,
                            type: 'OUTREACH_RESPONSE_RECEIVED',
                            source: 'MANUAL',
                            summary: `Received a response from ${contact.personName}`,
                            sourceUrl: contact.profileUrl,
                            occurredAt: now,
                        },
                    })
                }

                return toOutreachContact(contact)
            })
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                return null
            }

            throw error
        }
    },
}

export const outreachRunRepository: OutreachRunRepository = {
    async create(input) {
        try {
            const run = await prisma.outreachRun.create({ data: input })

            return toOutreachRun(run)
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
                return null
            }

            throw error
        }
    },

    async findById(id) {
        const run = await prisma.outreachRun.findUnique({ where: { id } })

        return run === null ? null : toOutreachRun(run)
    },

    async update(id, input) {
        const data: Prisma.OutreachRunUpdateInput =
            input.status === 'running'
                ? {
                      status: 'RUNNING',
                      agentTaskId: input.agentTaskId,
                      agentThreadId: input.agentThreadId,
                      agentTurnId: input.agentTurnId,
                      error: null,
                      completedAt: null,
                  }
                : {
                      status: input.status === 'completed' ? 'COMPLETED' : 'FAILED',
                      error: input.status === 'failed' ? input.error : null,
                      completedAt: new Date(),
                  }

        try {
            return toOutreachRun(await prisma.outreachRun.update({ where: { id }, data }))
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                return null
            }

            throw error
        }
    },
}
