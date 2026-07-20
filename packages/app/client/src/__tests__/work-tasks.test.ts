import type { JobPost } from '@job-search-facilitator/core'
import { describe, expect, it } from 'vitest'
import { createDraftTask, createOutreachTask, type OutreachContact } from '../work-tasks'

const post: JobPost = {
    id: 'post-id',
    sourceKey: 'example:post-id',
    roleTitle: 'Platform Engineer',
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    postSource: 'Greenhouse',
    applicationUrl: 'https://example.com/jobs/post-id',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userRank: null,
    userLabel: 'P1',
    archivedAt: null,
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
}

const contact: OutreachContact = {
    personName: 'Ada Lovelace',
    personTitle: 'Engineering Manager',
    profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
    relevanceRationale: 'Her visible role is relevant to the team.',
}

describe('outreach work tasks', () => {
    it.each([
        ['initial outreach', createOutreachTask(post)],
        [
            'draft revision',
            createDraftTask(
                post,
                contact,
                'Hi Ada, could I ask about the team?',
                'Make it warmer.',
            ),
        ],
    ])('guides %s messages toward natural formatting', (_name, task) => {
        expect(task.prompt).toContain('intentional line breaks')
        expect(task.prompt).toContain('Never use em dashes')
        expect(task.prompt).toContain('not a generated template')
    })
})
