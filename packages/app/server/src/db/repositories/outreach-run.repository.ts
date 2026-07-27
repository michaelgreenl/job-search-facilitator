import type {
    CreateOutreachRunInput,
    OutreachRun,
    OutreachRunStatus,
    UpdateOutreachRunInput,
} from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
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
    workTaskId: run.workTaskId,
    workThreadId: run.workThreadId,
    workTurnId: run.workTurnId,
    error: run.error,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
})

export interface OutreachRunRepository {
    create(input: CreateOutreachRunInput): Promise<OutreachRun | null>
    findById(id: string): Promise<OutreachRun | null>
    update(id: string, input: UpdateOutreachRunInput): Promise<OutreachRun | null>
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
