import type { OutreachContact, OutreachContactInput } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'
import { prisma } from '../prisma.ts'

type PrismaOutreachContact = Prisma.OutreachContactGetPayload<object>

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

export interface OutreachContactRepository {
    create(jobPostId: string, input: OutreachContactInput): Promise<OutreachContact | null>
    findByJobPostId(jobPostId: string): Promise<OutreachContact[]>
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
}
