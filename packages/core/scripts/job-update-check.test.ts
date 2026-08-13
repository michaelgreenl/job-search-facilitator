import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseJobUpdateCheckResult } from '../src/index.ts'

const validUpdate = {
    kind: 'review-needed',
    jobPostId: '11111111-1111-4111-8111-111111111111',
    source: 'gmail',
    externalId: 'message-1',
    summary: 'Review this update',
    sourceUrl: 'https://mail.google.com/mail/u/0/#inbox/message-1',
    occurredAt: '2026-08-13T12:00:00Z',
    outreachContactId: null,
} as const

void test('validates job update evidence timestamps and URLs', () => {
    const result = { warnings: [], updates: [validUpdate] }

    assert.deepEqual(parseJobUpdateCheckResult(result), result)

    for (const update of [
        { ...validUpdate, occurredAt: '2026-13-40T25:61:61Z' },
        { ...validUpdate, sourceUrl: 'https://%' },
    ]) {
        assert.throws(() => parseJobUpdateCheckResult({ warnings: [], updates: [update] }))
    }
})
