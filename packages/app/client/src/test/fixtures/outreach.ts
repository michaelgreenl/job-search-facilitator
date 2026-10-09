import type { OutreachContact } from '@job-search-facilitator/core'

export function makeOutreachContact(overrides: Partial<OutreachContact> = {}): OutreachContact {
    const id = overrides.id ?? '50000000-0000-4000-8000-000000000001'

    return {
        id,
        jobPostId: '10000000-0000-4000-8000-000000000001',
        personName: 'Ada Lovelace',
        personTitle: 'Engineering Manager',
        profileUrl: `https://www.linkedin.com/in/${id}`,
        email: null,
        relevanceRationale: 'Their visible role is relevant to the team.',
        draftMessage: 'Hi Ada, could I ask about the team?',
        messaged: false,
        messagedAt: null,
        respondedAt: null,
        createdAt: '2026-07-20T12:00:00.000Z',
        updatedAt: '2026-07-20T12:00:00.000Z',
        ...overrides,
    }
}
