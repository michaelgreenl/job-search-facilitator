import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CreateUserAddedJobPostInput, UserAddedJobPost } from '../src/index.ts'
import {
    parseCreateUserAddedJobPostInput,
    parseUserAddedJobPost,
    parseUserAddedJobPosts,
} from '../src/runtime-contracts.ts'

const input: CreateUserAddedJobPostInput = {
    agentLabel: 'target',
    fitRationale: 'Strong TypeScript experience',
    applicationFlow: 'Direct company application',
    keyLegitimacySignals: 'Listed on the company careers page',
    recommendedResume: 'frontend',
    recommendedAction: 'Apply today',
    legitimacyNotes: null,
    post: {
        sourceKey: 'example-source:123',
        roleTitle: 'Software Engineer',
        company: 'Example Company',
        location: 'Detroit, MI',
        compensation: '$120,000',
        techStack: 'TypeScript, Vue, Node.js',
        postSource: 'Example Source',
        postUrl: 'https://example.com/jobs/123?source=search#apply',
        applicationUrl: 'https://apply.example.com/jobs/123',
        postStatus: 'active',
    },
}

const item: UserAddedJobPost = {
    ...input,
    post: {
        ...input.post,
        id: '11111111-1111-4111-8111-111111111111',
        applicationStatus: 'not-applied',
        userLabel: null,
        archivedAt: null,
        createdAt: '2026-07-12T10:00:00.000Z',
        updatedAt: '2026-07-12T10:00:00.000Z',
    },
    addedAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
}

void test('parses a strict user-added job post input', () => {
    assert.deepEqual(parseCreateUserAddedJobPostInput(input), input)
})

void test('rejects extra fields from a user-added job post input', () => {
    assert.throws(() => parseCreateUserAddedJobPostInput({ ...input, agentRank: 1 }))
})

void test('rejects malformed HTTP URLs from a user-added job post input', () => {
    assert.throws(() =>
        parseCreateUserAddedJobPostInput({
            ...input,
            post: { ...input.post, postUrl: 'https://%' },
        }),
    )
})

void test('parses a saved user-added job post', () => {
    assert.deepEqual(parseUserAddedJobPost(item), item)
})

void test('parses a list of saved user-added job posts', () => {
    assert.deepEqual(parseUserAddedJobPosts([item]), [item])
})

void test('rejects a saved user-added job post without membership timestamps', () => {
    const { addedAt: _addedAt, ...invalidItem } = item

    assert.throws(() => parseUserAddedJobPost(invalidItem))
})
