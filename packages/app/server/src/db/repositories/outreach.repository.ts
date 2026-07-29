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
import { prisma } from '../prisma.ts'

type PrismaOutreachContact = Prisma.OutreachContactGetPayload<object>
type PrismaOutreachRun = Prisma.OutreachRunGetPayload<object>

const statusToApi = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
} satisfies Record<PrismaOutreachRun['status'], OutreachRunStatus>

const toOutreachContact = (contact: PrismaOutreachContact): OutreachContact => ({
    id: contact.id,
    jobPostId: contact.jobPostId,
    personName: contact.personName,
    personTitle: contact.personTitle,
    profileUrl: contact.profileUrl,
    relevanceRationale: contact.relevanceRationale,
    draftMessage: contact.draftMessage,
    messaged: contact.messaged,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
})

const toOutreachRun = (run: PrismaOutreachRun): OutreachRun => ({
    id: run.id,
    jobPostId: run.jobPostId,
    requestedContactCount: run.requestedContactCount as OutreachRun['requestedContactCount'],
    status: statusToApi[run.status],
    workTaskId: run.workTaskId,
    workThreadId: run.workThreadId,
    workTurnId: run.workTurnId,
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
            const contact = await prisma.outreachContact.update({
                where: { id: contactId, jobPostId },
                data: input,
            })

            return toOutreachContact(contact)
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
                      workTaskId: input.workTaskId,
                      workThreadId: input.workThreadId,
                      workTurnId: input.workTurnId,
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
