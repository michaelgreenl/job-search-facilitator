import type { JobPost, OutreachContact } from '@job-search-facilitator/core'
import { describe, expect, it } from 'vitest'
import { createContactDiscoveryTask, createDraftRevisionTask } from '../work-tasks'

const post: JobPost = {
    id: 'post-id',
    sourceKey: 'example:post-id',
    roleTitle: 'Platform Engineer',
    company: 'Example Co',
    location: 'Remote',
    compensation: null,
    techStack: 'TypeScript, Node.js, PostgreSQL',
    postSource: 'Greenhouse',
    postUrl: 'https://example.com/jobs/post-id',
    applicationUrl: 'https://apply.example.com/jobs/post-id',
    postStatus: 'active',
    applicationStatus: 'not-applied',
    userLabel: 'P1',
    archivedAt: null,
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
}

const contact: OutreachContact = {
    id: 'contact-id',
    jobPostId: post.id,
    personName: 'Ada Lovelace',
    personTitle: 'Engineering Manager',
    profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
    relevanceRationale: 'Her visible role is relevant to the team.',
    draftMessage: 'Hi Ada, could I ask about the team?',
    messaged: false,
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
}
const discoveryTask = createContactDiscoveryTask(post)
const draftTask = createDraftRevisionTask(
    post,
    contact,
    'Hi Ada, could I ask about the team?',
    'Make it warmer.',
)

describe('outreach work tasks', () => {
    it('defines the contact discovery capability and output contract', () => {
        expect(discoveryTask.capabilities).toEqual(['chrome'])
        expect(discoveryTask.outputSchema.required).toEqual([
            'personName',
            'personTitle',
            'profileUrl',
            'relevanceRationale',
            'draftMessage',
        ])
    })

    it('defines the draft revision capability and output contract', () => {
        expect(draftTask.capabilities).toEqual([])
        expect(draftTask.outputSchema.required).toEqual(['draftMessage', 'response'])
    })
})
