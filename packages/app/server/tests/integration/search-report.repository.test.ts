import type {
    CreateUserAddedJobPostInput,
    JobPostInput,
    JobSearchResultInput,
    UpsertJobSearchReportInput,
} from '@job-search-facilitator/core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { jobPostRepository } from '../../src/db/repositories/job-post.repository.ts'
import {
    outreachContactRepository,
    outreachRunRepository,
} from '../../src/db/repositories/outreach.repository.ts'
import { searchReportRepository } from '../../src/db/repositories/search-report.repository.ts'
import { prisma } from '../../src/db/prisma.ts'

const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required for repository integration tests')
}

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1))

if (!databaseName.endsWith('_test')) {
    throw new Error('Integration test database name must end in "_test"')
}

const createPostInput = (overrides: Partial<JobPostInput> = {}): JobPostInput => ({
    sourceKey: 'example-source:123',
    description: 'Complete example job description',
    roleTitle: 'Software Engineer',
    company: 'Example Company',
    location: 'Detroit, MI',
    compensation: '$120,000',
    techStack: 'TypeScript, Vue, Node.js',
    postSource: 'Example Source',
    postUrl: 'https://example.com/jobs/123',
    applicationUrl: 'https://apply.example.com/jobs/123',
    postStatus: 'active',
    ...overrides,
})

type ResultOverrides = Partial<Omit<JobSearchResultInput, 'post'>> & {
    post?: Partial<JobPostInput>
}

const createResultInput = (overrides: ResultOverrides = {}): JobSearchResultInput => {
    const {
        agentRank = 1,
        agentLabel = 'target',
        fitRationale = 'Strong TypeScript experience',
        applicationFlow = 'Direct company application',
        keyLegitimacySignals = 'Listed on the company careers page',
        recommendedResume = 'frontend',
        recommendedAction = 'Apply today',
        legitimacyNotes = null,
        post,
    } = overrides

    return {
        agentRank,
        agentLabel,
        fitRationale,
        applicationFlow,
        keyLegitimacySignals,
        recommendedResume,
        recommendedAction,
        legitimacyNotes,
        post: createPostInput(post),
    }
}

const createReportInput = (
    overrides: Partial<UpsertJobSearchReportInput> = {},
): UpsertJobSearchReportInput => {
    const { summary = 'One strong match', results = [createResultInput()] } = overrides

    return { summary, results }
}

type UserAddedInputOverrides = Partial<Omit<CreateUserAddedJobPostInput, 'post'>> & {
    post?: Partial<JobPostInput>
}

const createUserAddedInput = (
    overrides: UserAddedInputOverrides = {},
): CreateUserAddedJobPostInput => {
    const result = createResultInput(overrides)
    const { agentRank: _agentRank, ...input } = result

    return input
}

beforeEach(async () => {
    await prisma.outreachContact.deleteMany()
    await prisma.outreachRun.deleteMany()
    await prisma.userAddedJobPost.deleteMany()
    await prisma.jobSearchResult.deleteMany()
    await prisma.jobSearchReport.deleteMany()
    await prisma.jobPost.deleteMany()
})

afterAll(async () => {
    await prisma.$disconnect()
})

describe('job post repository', () => {
    it('persists and lists a user-added post without a search report', async () => {
        const created = await jobPostRepository.upsertUserAdded(createUserAddedInput())

        const [items, postCount, userAddedCount, reportCount, resultCount] = await Promise.all([
            jobPostRepository.findUserAdded(),
            prisma.jobPost.count(),
            prisma.userAddedJobPost.count(),
            prisma.jobSearchReport.count(),
            prisma.jobSearchResult.count(),
        ])

        expect(created.created).toBe(true)
        expect(items).toEqual([created.item])
        expect(postCount).toBe(1)
        expect(userAddedCount).toBe(1)
        expect(reportCount).toBe(0)
        expect(resultCount).toBe(0)
    })

    it('lists user-added posts newest first with a stable post ID tie-break', async () => {
        const first = await jobPostRepository.upsertUserAdded(
            createUserAddedInput({ post: { sourceKey: 'example-source:first-added' } }),
        )
        const second = await jobPostRepository.upsertUserAdded(
            createUserAddedInput({ post: { sourceKey: 'example-source:second-added' } }),
        )
        const third = await jobPostRepository.upsertUserAdded(
            createUserAddedInput({ post: { sourceKey: 'example-source:third-added' } }),
        )
        const newestAddedAt = new Date('2026-07-21T12:00:00.000Z')

        await Promise.all([
            prisma.userAddedJobPost.update({
                where: { postId: first.item.post.id },
                data: { createdAt: new Date('2026-07-20T12:00:00.000Z') },
            }),
            prisma.userAddedJobPost.update({
                where: { postId: second.item.post.id },
                data: { createdAt: newestAddedAt },
            }),
            prisma.userAddedJobPost.update({
                where: { postId: third.item.post.id },
                data: { createdAt: newestAddedAt },
            }),
        ])

        const items = await jobPostRepository.findUserAdded()
        const tiedPostIds = [second.item.post.id, third.item.post.id].sort()

        expect(items.map(({ post }) => post.id)).toEqual([...tiedPostIds, first.item.post.id])
    })

    it('reuses a report post while preserving user state and refreshing standalone analysis', async () => {
        const sourceKey = 'example-source:report-and-user-added'
        const archivedAt = '2026-07-12T12:00:00.000Z'
        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-12',
            createReportInput({
                results: [createResultInput({ post: { sourceKey } })],
            }),
        )
        const reportPost = report.report.results[0]!.post

        await jobPostRepository.update(reportPost.id, {
            applicationStatus: 'interviewing',
            userLabel: 'forgo',
            archivedAt,
        })

        const first = await jobPostRepository.upsertUserAdded(
            createUserAddedInput({
                recommendedAction: 'Apply after reviewing the team',
                post: {
                    sourceKey,
                    roleTitle: 'Senior Software Engineer',
                },
            }),
        )
        const refreshedInput = createUserAddedInput({
            fitRationale: 'Updated standalone fit analysis',
            recommendedAction: 'Apply through the company site today',
            post: {
                sourceKey,
                roleTitle: 'Staff Software Engineer',
                company: 'Updated Company',
                postStatus: 'closed',
            },
        })
        const refreshed = await jobPostRepository.upsertUserAdded(refreshedInput)
        const [savedReport, listedItems, postCount, userAddedCount, resultCount] =
            await Promise.all([
                searchReportRepository.findById(report.report.id),
                jobPostRepository.findUserAdded(),
                prisma.jobPost.count(),
                prisma.userAddedJobPost.count(),
                prisma.jobSearchResult.count(),
            ])

        expect(first.created).toBe(true)
        expect(refreshed.created).toBe(false)
        expect(refreshed.item).toMatchObject({
            fitRationale: refreshedInput.fitRationale,
            recommendedAction: refreshedInput.recommendedAction,
            addedAt: first.item.addedAt,
            post: {
                id: reportPost.id,
                sourceKey,
                roleTitle: 'Staff Software Engineer',
                company: 'Updated Company',
                postStatus: 'closed',
                applicationStatus: 'interviewing',
                userLabel: 'forgo',
                archivedAt,
            },
        })
        expect(listedItems).toEqual([refreshed.item])
        expect(savedReport?.results[0]).toMatchObject({
            recommendedAction: report.report.results[0]!.recommendedAction,
            post: refreshed.item.post,
        })
        expect(postCount).toBe(1)
        expect(userAddedCount).toBe(1)
        expect(resultCount).toBe(1)
    })

    it('keeps standalone membership and analysis when a later report refreshes the post', async () => {
        const sourceKey = 'example-source:user-added-then-report'
        const archivedAt = '2026-07-12T12:00:00.000Z'
        const standaloneInput = createUserAddedInput({
            fitRationale: 'Standalone fit analysis',
            recommendedAction: 'Standalone recommendation',
            post: { sourceKey },
        })
        const standalone = await jobPostRepository.upsertUserAdded(standaloneInput)

        await jobPostRepository.update(standalone.item.post.id, {
            applicationStatus: 'interviewing',
            userLabel: 'P1',
            archivedAt,
        })

        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-12',
            createReportInput({
                results: [
                    createResultInput({
                        fitRationale: 'Report-specific fit analysis',
                        recommendedAction: 'Report recommendation',
                        post: {
                            sourceKey,
                            roleTitle: 'Staff Software Engineer',
                            company: 'Updated Company',
                            postStatus: 'closed',
                        },
                    }),
                ],
            }),
        )
        const [items, postCount, userAddedCount] = await Promise.all([
            jobPostRepository.findUserAdded(),
            prisma.jobPost.count(),
            prisma.userAddedJobPost.count(),
        ])

        expect(report.report.results[0]!.post.id).toBe(standalone.item.post.id)
        expect(items).toMatchObject([
            {
                fitRationale: standaloneInput.fitRationale,
                recommendedAction: standaloneInput.recommendedAction,
                addedAt: standalone.item.addedAt,
                post: {
                    id: standalone.item.post.id,
                    roleTitle: 'Staff Software Engineer',
                    company: 'Updated Company',
                    postStatus: 'closed',
                    applicationStatus: 'interviewing',
                    userLabel: 'P1',
                    archivedAt,
                },
            },
        ])
        expect(postCount).toBe(1)
        expect(userAddedCount).toBe(1)
    })

    it('defines the Apply queue by application status and user label', async () => {
        const userLabels = ['P1', 'P1', 'P2', 'quick-app', 'forgo', null] as const
        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-12',
            createReportInput({
                results: userLabels.map((_, index) =>
                    createResultInput({
                        agentRank: index + 1,
                        post: { sourceKey: `example-source:${index}` },
                    }),
                ),
            }),
        )

        const labelUpdates = await Promise.all(
            userLabels.map((userLabel, index) =>
                jobPostRepository.update(report.report.results[index]!.post.id, { userLabel }),
            ),
        )
        const appliedUpdate = await jobPostRepository.update(report.report.results[0]!.post.id, {
            applicationStatus: 'awaiting-response',
        })

        const applyQueueItems = await jobPostRepository.findApplyQueue()
        const sourceKeys = applyQueueItems.map(({ post }) => post.sourceKey)

        expect(labelUpdates.map((update) => update?.inApplyQueue)).toEqual([
            true,
            true,
            true,
            true,
            false,
            false,
        ])
        expect(appliedUpdate?.inApplyQueue).toBe(false)
        expect(sourceKeys).toHaveLength(3)
        expect(sourceKeys).toEqual(
            expect.arrayContaining(['example-source:1', 'example-source:2', 'example-source:3']),
        )
    })

    it('selects tracked posts by applied or messaged outreach status', async () => {
        const sourceKeys = [
            'example-source:neither',
            'example-source:applied',
            'example-source:messaged',
            'example-source:both',
            'example-source:unmessaged',
        ]
        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-12',
            createReportInput({
                results: sourceKeys.map((sourceKey, index) =>
                    createResultInput({
                        agentRank: index + 1,
                        post: { sourceKey },
                    }),
                ),
            }),
        )
        const postsBySourceKey = new Map(
            report.report.results.map(({ post }) => [post.sourceKey, post]),
        )
        const appliedPost = postsBySourceKey.get('example-source:applied')!
        const messagedPost = postsBySourceKey.get('example-source:messaged')!
        const bothPost = postsBySourceKey.get('example-source:both')!
        const unmessagedPost = postsBySourceKey.get('example-source:unmessaged')!

        await Promise.all([
            jobPostRepository.update(appliedPost.id, {
                applicationStatus: 'awaiting-response',
            }),
            jobPostRepository.update(bothPost.id, { applicationStatus: 'interviewing' }),
        ])

        const contacts = await Promise.all(
            [messagedPost, bothPost, unmessagedPost].map((post) =>
                outreachContactRepository.create(post.id, {
                    personName: `Contact for ${post.sourceKey}`,
                    personTitle: 'Engineering Manager',
                    profileUrl: `https://www.linkedin.com/in/${post.id}`,
                    relevanceRationale: 'Their role aligns with the position.',
                    draftMessage: 'Hello, I would value your perspective on the role.',
                }),
            ),
        )

        if (contacts.some((contact) => contact === null)) {
            throw new Error('Could not create tracking contacts')
        }

        await Promise.all(
            contacts.slice(0, 2).map((contact) =>
                outreachContactRepository.update(contact!.jobPostId, contact!.id, {
                    messaged: true,
                }),
            ),
        )

        const trackedSourceKeys = (await jobPostRepository.findTracked())
            .map(({ post }) => post.sourceKey)
            .sort()

        expect(trackedSourceKeys).toEqual(
            ['example-source:applied', 'example-source:both', 'example-source:messaged'].sort(),
        )
    })

    it('selects one deterministic report recommendation for each Apply queue post', async () => {
        const sourceKey = 'example-source:recommendation-context'
        const reports = [
            {
                id: '11111111-1111-4111-8111-111111111111',
                reportDate: '2026-07-20',
                createdAt: '2026-07-30T12:00:00.000Z',
                agentRank: 1,
                recommendedAction: 'Ignore the older report date',
            },
            {
                id: '22222222-2222-4222-8222-222222222222',
                reportDate: '2026-07-21',
                createdAt: '2026-07-21T11:00:00.000Z',
                agentRank: 1,
                recommendedAction: 'Ignore the earlier run on the same date',
            },
            {
                id: '44444444-4444-4444-8444-444444444444',
                reportDate: '2026-07-21',
                createdAt: '2026-07-21T12:00:00.000Z',
                agentRank: 1,
                recommendedAction: 'Ignore the higher report ID',
            },
            {
                id: '33333333-3333-4333-8333-333333333333',
                reportDate: '2026-07-21',
                createdAt: '2026-07-21T12:00:00.000Z',
                agentRank: 9,
                recommendedAction: 'Use the deterministic recommendation',
            },
        ] as const

        for (const report of reports) {
            await searchReportRepository.upsertById(
                report.id,
                report.reportDate,
                createReportInput({
                    results: [
                        createResultInput({
                            agentRank: report.agentRank,
                            recommendedAction: report.recommendedAction,
                            post: { sourceKey },
                        }),
                    ],
                }),
            )
            await prisma.jobSearchReport.update({
                where: { id: report.id },
                data: { createdAt: new Date(report.createdAt) },
            })
        }

        await prisma.jobSearchReport.update({
            where: { id: reports[3].id },
            data: { archivedAt: new Date('2026-07-22T00:00:00.000Z') },
        })

        const sharedPost = await prisma.jobPost.findUniqueOrThrow({ where: { sourceKey } })
        await jobPostRepository.update(sharedPost.id, { userLabel: 'P1' })

        const orphanPost = await prisma.jobPost.create({
            data: {
                sourceKey: 'example-source:orphan',
                roleTitle: 'Orphaned recommendation',
                company: 'Example Company',
                location: null,
                compensation: null,
                techStack: 'TypeScript',
                postSource: 'Example Source',
                postUrl: 'https://example.com/jobs/orphan',
                applicationUrl: 'https://apply.example.com/jobs/orphan',
                postStatus: 'ACTIVE',
                userLabel: 'P2',
            },
        })

        const applyQueueItems = await jobPostRepository.findApplyQueue()
        const selectedItem = applyQueueItems.find(({ post }) => post.id === sharedPost.id)
        const orphanItem = applyQueueItems.find(({ post }) => post.id === orphanPost.id)

        expect(selectedItem?.recommendationContext).toMatchObject({
            reportId: reports[3].id,
            reportDate: reports[3].reportDate,
            agentRank: 9,
        })
        expect(orphanItem?.recommendationContext).toBeNull()
    })
})

describe('outreach run repository', () => {
    it('persists the Agent task lifecycle for a job post', async () => {
        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-18',
            createReportInput(),
        )
        const jobPostId = report.report.results[0]!.post.id
        const created = await outreachRunRepository.create({
            jobPostId,
            requestedContactCount: 3,
        })

        expect(created).not.toBeNull()

        const running = await outreachRunRepository.update(created!.id, {
            status: 'running',
            agentTaskId: '22222222-2222-4222-8222-222222222222',
            agentThreadId: 'thread-id',
            agentTurnId: 'turn-id',
        })
        const completed = await outreachRunRepository.update(created!.id, {
            status: 'completed',
        })

        expect(running).toMatchObject({
            status: 'running',
            agentTaskId: '22222222-2222-4222-8222-222222222222',
            agentThreadId: 'thread-id',
            agentTurnId: 'turn-id',
        })
        expect(completed).toMatchObject({
            status: 'completed',
            error: null,
        })
        expect(completed?.completedAt).not.toBeNull()
    })
})

describe('outreach contact repository', () => {
    it('stores, updates, and lists job-post contacts', async () => {
        const report = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-21',
            createReportInput(),
        )
        const jobPostId = report.report.results[0]!.post.id
        const first = await outreachContactRepository.create(jobPostId, {
            personName: 'Ada Lovelace',
            personTitle: 'Engineering Manager',
            profileUrl: 'https://www.linkedin.com/in/ada-lovelace',
            relevanceRationale: 'Her visible role aligns with the position.',
            draftMessage: 'Hi Ada, I would value your perspective on the role.',
        })
        const second = await outreachContactRepository.create(jobPostId, {
            personName: 'Grace Hopper',
            personTitle: 'Director of Engineering',
            profileUrl: 'https://www.linkedin.com/in/grace-hopper',
            relevanceRationale: 'Her visible role aligns with the team.',
            draftMessage: 'Hi Grace, I would value your perspective on the team.',
        })

        if (first === null || second === null) {
            throw new Error('Could not create outreach contacts')
        }

        const wrongPostUpdate = await outreachContactRepository.update(
            '22222222-2222-4222-8222-222222222222',
            first.id,
            { messaged: true },
        )
        const updatedFirst = await outreachContactRepository.update(jobPostId, first.id, {
            messaged: true,
        })

        const contacts = await outreachContactRepository.findByJobPostId(jobPostId)

        expect(wrongPostUpdate).toBeNull()
        expect(updatedFirst).toMatchObject({ id: first.id, jobPostId, messaged: true })
        expect(second).toMatchObject({ jobPostId, messaged: false })
        expect(contacts).toHaveLength(2)
        expect(contacts.map(({ id }) => id)).toEqual(expect.arrayContaining([first.id, second.id]))
        expect(contacts.find(({ id }) => id === first.id)?.messaged).toBe(true)
    })
})

describe('search report repository', () => {
    it('replaces one report run without duplicating the report', async () => {
        const reportDate = '2026-07-12'
        const reportId = '11111111-1111-4111-8111-111111111111'
        const initialInput = createReportInput({
            summary: 'Two initial matches',
            results: [
                createResultInput({
                    agentRank: 1,
                    post: { sourceKey: 'example-source:first' },
                }),
                createResultInput({
                    agentRank: 2,
                    post: { sourceKey: 'example-source:second' },
                }),
            ],
        })
        const replacementInput = createReportInput({
            summary: 'One replacement match',
            results: [
                createResultInput({
                    post: {
                        sourceKey: 'example-source:second',
                        roleTitle: 'Senior Software Engineer',
                    },
                }),
            ],
        })

        const initial = await searchReportRepository.upsertById(reportId, reportDate, initialInput)
        const replacement = await searchReportRepository.upsertById(
            reportId,
            reportDate,
            replacementInput,
        )
        const [reportCount, resultCount] = await Promise.all([
            prisma.jobSearchReport.count(),
            prisma.jobSearchResult.count(),
        ])

        expect(initial.created).toBe(true)
        expect(replacement.created).toBe(false)
        expect(replacement.report).toMatchObject({
            id: initial.report.id,
            summary: replacementInput.summary,
            results: [
                {
                    applicationFlow: replacementInput.results[0]?.applicationFlow,
                    keyLegitimacySignals: replacementInput.results[0]?.keyLegitimacySignals,
                    post: {
                        sourceKey: 'example-source:second',
                        roleTitle: 'Senior Software Engineer',
                    },
                },
            ],
        })
        expect(reportCount).toBe(1)
        expect(resultCount).toBe(1)
    })

    it('creates separate reports for runs on the same date', async () => {
        const reportDate = '2026-07-12'
        const first = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            reportDate,
            createReportInput({ summary: 'First run' }),
        )
        const second = await searchReportRepository.upsertById(
            '22222222-2222-4222-8222-222222222222',
            reportDate,
            createReportInput({ summary: 'Second run' }),
        )
        const reports = await searchReportRepository.findMany()

        expect(first.created).toBe(true)
        expect(second.created).toBe(true)
        expect(reports).toHaveLength(2)
        expect(reports.map(({ id }) => id)).toEqual(
            expect.arrayContaining([first.report.id, second.report.id]),
        )
    })

    it('shares canonical posts while preserving user state during listing refreshes', async () => {
        const sourceKey = 'example-source:shared'
        const archivedAt = '2026-07-12T12:00:00.000Z'
        const first = await searchReportRepository.upsertById(
            '11111111-1111-4111-8111-111111111111',
            '2026-07-12',
            createReportInput({
                results: [createResultInput({ post: { sourceKey } })],
            }),
        )
        const postId = first.report.results[0]?.post.id

        expect(postId).toBeDefined()
        await jobPostRepository.update(postId!, {
            applicationStatus: 'interviewing',
            userLabel: 'forgo',
            archivedAt,
        })

        const second = await searchReportRepository.upsertById(
            '22222222-2222-4222-8222-222222222222',
            '2026-07-13',
            createReportInput({
                results: [
                    createResultInput({
                        post: {
                            sourceKey,
                            roleTitle: 'Senior Software Engineer',
                            company: 'Updated Company',
                            location: 'Remote',
                            compensation: '$150,000',
                            techStack: 'TypeScript, React, Node.js, PostgreSQL',
                            postSource: 'Updated Source',
                            postUrl: 'https://example.com/jobs/updated',
                            applicationUrl: 'https://apply.example.com/jobs/updated',
                            postStatus: 'closed',
                        },
                    }),
                ],
            }),
        )
        const refreshedPost = second.report.results[0]?.post
        const [postCount, reportCount, membershipCount, firstRead, secondRead] = await Promise.all([
            prisma.jobPost.count(),
            prisma.jobSearchReport.count(),
            prisma.jobSearchResult.count({ where: { postId } }),
            searchReportRepository.findById(first.report.id),
            searchReportRepository.findById(second.report.id),
        ])

        expect(second.created).toBe(true)
        expect(refreshedPost).toMatchObject({
            id: postId,
            sourceKey,
            roleTitle: 'Senior Software Engineer',
            company: 'Updated Company',
            location: 'Remote',
            compensation: '$150,000',
            techStack: 'TypeScript, React, Node.js, PostgreSQL',
            postSource: 'Updated Source',
            postUrl: 'https://example.com/jobs/updated',
            applicationUrl: 'https://apply.example.com/jobs/updated',
            postStatus: 'closed',
            applicationStatus: 'interviewing',
            userLabel: 'forgo',
            archivedAt,
        })
        expect(postCount).toBe(1)
        expect(reportCount).toBe(2)
        expect(membershipCount).toBe(2)
        expect(firstRead?.results[0]?.post).toEqual(refreshedPost)
        expect(secondRead?.results[0]?.post).toEqual(refreshedPost)
    })

    it('rolls back a failed replacement after deleting prior joins', async () => {
        const reportDate = '2026-07-12'
        const reportId = '11111111-1111-4111-8111-111111111111'
        const initial = await searchReportRepository.upsertById(
            reportId,
            reportDate,
            createReportInput({
                summary: 'Stable snapshot',
                results: [
                    createResultInput({
                        post: {
                            sourceKey: 'example-source:stable',
                            roleTitle: 'Stable Role',
                        },
                    }),
                ],
            }),
        )
        const invalidReplacement = createReportInput({
            summary: 'Must roll back',
            results: [
                createResultInput({
                    agentRank: 1,
                    post: {
                        sourceKey: 'example-source:stable',
                        roleTitle: 'Mutated Role',
                    },
                }),
                createResultInput({
                    agentRank: 1,
                    post: { sourceKey: 'example-source:new' },
                }),
            ],
        })

        await expect(
            searchReportRepository.upsertById(reportId, reportDate, invalidReplacement),
        ).rejects.toThrow()

        const savedReport = await searchReportRepository.findById(reportId)
        const [reportCount, resultCount, postCount] = await Promise.all([
            prisma.jobSearchReport.count(),
            prisma.jobSearchResult.count(),
            prisma.jobPost.count(),
        ])

        expect(savedReport).toEqual(initial.report)
        expect(reportCount).toBe(1)
        expect(resultCount).toBe(1)
        expect(postCount).toBe(1)
    })
})
