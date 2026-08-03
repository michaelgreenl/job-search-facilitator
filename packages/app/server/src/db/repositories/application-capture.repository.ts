import type { ApplicationCaptureResult } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { prisma } from '../prisma.ts'

export interface ApplicationCaptureRepository {
    save(jobPostId: string, capture: ApplicationCaptureResult): Promise<boolean>
}

export const applicationCaptureRepository: ApplicationCaptureRepository = {
    async save(jobPostId, capture) {
        try {
            await prisma.$transaction(async (transaction) => {
                const capturedAt = new Date()
                await transaction.jobPostSnapshot.upsert({
                    where: { jobPostId },
                    create: {
                        jobPostId,
                        ...capture.jobPost,
                        capturedAt,
                    },
                    update: {
                        ...capture.jobPost,
                        capturedAt,
                    },
                })
                await transaction.applicationSnapshot.upsert({
                    where: { jobPostId },
                    create: {
                        jobPostId,
                        ...capture.application,
                        capturedAt,
                    },
                    update: {
                        ...capture.application,
                        capturedAt,
                    },
                })
            })
            return true
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
                return false
            }

            throw error
        }
    },
}
