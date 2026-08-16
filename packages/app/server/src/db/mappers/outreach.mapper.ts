import type { OutreachContact } from '@job-search-facilitator/core'
import { Prisma } from '@job-search-facilitator/core/prisma'

type PrismaOutreachContact = Prisma.OutreachContactGetPayload<object>

export const toOutreachContact = (contact: PrismaOutreachContact): OutreachContact => ({
    id: contact.id,
    jobPostId: contact.jobPostId,
    personName: contact.personName,
    personTitle: contact.personTitle,
    profileUrl: contact.profileUrl,
    relevanceRationale: contact.relevanceRationale,
    draftMessage: contact.draftMessage,
    messaged: contact.messaged,
    messagedAt: contact.messagedAt?.toISOString() ?? null,
    respondedAt: contact.respondedAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
})
