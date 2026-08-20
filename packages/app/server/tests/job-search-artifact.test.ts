import { access, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    MAX_JSON_REQUEST_BYTES,
    type JobPost,
    type JobPostInput,
    type JobSearchReport,
    type UpsertJobSearchReportInput,
} from '@job-search-facilitator/core'
import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { formatCliError, readIntoBuffer, runCli } from '../scripts/job-search-artifact.ts'
import {
    MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES,
    MAX_JOB_SEARCH_CANDIDATE_BYTES,
    MAX_JOB_SEARCH_COVERAGE_BYTES,
    MAX_JOB_SEARCH_HISTORY_FEEDBACK_BYTES,
    MAX_JOB_SEARCH_HISTORY_IDENTITY_BYTES,
    MAX_JOB_SEARCH_HISTORY_RESPONSE_BYTES,
    MAX_JOB_SEARCH_JUDGMENT_BYTES,
    MAX_JOB_SEARCH_REVIEW_BYTES,
    assembleFinalReport,
    createHistoryArtifacts,
    createReviewPacket,
    createSelectionFromJudgment,
    renderJobSearchMarkdown,
    validateAcceptedCandidate,
    validateCandidatePool,
    validateCoverage,
    validateSelection,
    validateSerializedCoverage,
    validateSerializedReport,
    validateSerializedReviewPacket,
    verifyApiResponse,
    verifyRenderedMarkdown,
    verifyStoredDescriptions,
    type JudgmentArtifact,
    type JobSearchCoverage,
    type SelectionArtifact,
    type StageCandidate,
    type StoredDescriptionResult,
} from '../src/job-search-artifact.ts'

const post: JobPostInput = {
    sourceKey: 'company:software-engineer',
    description:
        'Complete verbatim job description for the current posting.\nResponsibilities\nBuild the current product.',
    roleTitle: 'Software Engineer',
    company: 'Example Company',
    location: 'Remote, US',
    compensation: '$120,000-$150,000',
    techStack: 'TypeScript, Node.js',
    postSource: 'Company careers',
    postUrl: 'https://example.com/jobs/software-engineer',
    applicationUrl: 'https://example.com/jobs/software-engineer/apply',
    postStatus: 'active',
}

const candidate: StageCandidate = {
    post,
    applicationFlow: 'Direct company application with account requirements not yet shown.',
    keyLegitimacySignals: 'Current employer-hosted detail page and matching application route.',
    legitimacyNotes: null,
}

const selectedRecommendation = {
    sourceKey: post.sourceKey,
    agentLabel: 'target',
    fitRationale: 'Direct evidence covers the central UI and API responsibilities.',
    recommendedResume: 'backend-full-stack',
    recommendedAction: 'Apply and emphasize the directly comparable application work.',
} as const

const emptyHistoryIdentities = { identityDigests: [] }
const reviewedCandidate = createReviewPacket([candidate], emptyHistoryIdentities)
const selection: SelectionArtifact = {
    reviewDigest: reviewedCandidate.reviewDigest,
    selections: [selectedRecommendation],
}

const coverage: JobSearchCoverage = {
    sources: [
        {
            lane: 'linkedin',
            operations: [
                {
                    query: 'Application engineer, posted within three days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Frontend engineer, posted within three days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Full-stack product engineer, posted within seven days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Internal tools engineer, posted within fourteen days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Associate frontend engineer, posted within fourteen days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Software engineer I, posted within fourteen days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Software engineer, two to three years, posted within fourteen days',
                    completion: 'two-pages-reviewed',
                },
            ],
            accessMethod: 'installed-chrome-plugin',
            blocker: null,
        },
        {
            lane: 'indeed',
            operations: [
                {
                    query: 'Application engineer, posted within three days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Frontend engineer, posted within three days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Full-stack product engineer, posted within seven days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Internal tools engineer, posted within fourteen days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Associate frontend engineer, posted within fourteen days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Software engineer I, posted within fourteen days',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Software engineer, two to three years, posted within fourteen days',
                    completion: 'two-pages-reviewed',
                },
            ],
            accessMethod: 'installed-chrome-plugin',
            blocker: null,
        },
        {
            lane: 'vuejobs',
            operations: [
                {
                    query: 'Junior frontend, United States',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Frontend engineer, remote or hybrid',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Full-stack engineer, United States',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Backend engineer, United States',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Software engineer I, United States',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Application engineer, remote',
                    completion: 'two-pages-reviewed',
                },
                {
                    query: 'Vue developer, any experience',
                    completion: 'two-pages-reviewed',
                },
            ],
            accessMethod: 'installed-chrome-plugin',
            blocker: null,
        },
        {
            lane: 'direct-employer-ats',
            operations: [
                {
                    query: 'TypeScript application engineer, posted within three days',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Node application engineer, posted within three days',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Employer careers frontend engineer',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Employer careers backend API engineer',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Employer careers associate software engineer',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Employer careers software engineer I',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Employer careers software engineer two to three years',
                    completion: 'all-results-reviewed',
                },
            ],
            accessMethod: 'public-employer-ats',
            blocker: null,
        },
        {
            lane: 'rotating-long-tail',
            operations: [
                {
                    query: 'Current rotating long-tail query',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Second rotating long-tail query',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Third rotating long-tail query',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Fourth rotating long-tail query',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Fifth rotating long-tail query',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Sixth rotating long-tail query',
                    completion: 'all-results-reviewed',
                },
                {
                    query: 'Seventh rotating long-tail query',
                    completion: 'all-results-reviewed',
                },
            ],
            accessMethod: 'public-long-tail',
            blocker: null,
        },
    ],
}

const issuePaths = (operation: () => unknown): PropertyKey[][] => {
    try {
        operation()
    } catch (error) {
        if (error instanceof z.ZodError) {
            return error.issues.map((issue) => issue.path)
        }

        throw error
    }

    throw new Error('Expected a Zod validation error')
}

it('continues bounded reads after a short regular-file read', async () => {
    const source = Buffer.from('abcdef')
    const destination = Buffer.alloc(source.length + 1)
    let readCalls = 0
    const reader = {
        read: async (buffer: Buffer, offset: number, length: number, position: number) => {
            readCalls += 1
            const chunk = source.subarray(position, position + Math.min(length, 2))
            chunk.copy(buffer, offset)
            return { bytesRead: chunk.length }
        },
    }

    const bytesRead = await readIntoBuffer(reader, destination)

    expect({ bytesRead, readCalls, value: destination.subarray(0, bytesRead) }).toEqual({
        bytesRead: source.length,
        readCalls: 4,
        value: source,
    })
})

describe('search-stage candidate boundary', () => {
    it('rejects search-worker recommendation ownership', () => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    agentLabel: 'target',
                    fitRationale: 'Search verdict.',
                    recommendedResume: 'frontend',
                    recommendedAction: 'Apply.',
                }),
            ),
        ).toContainEqual([])
    })

    it('does not echo an unexpected source-data key through CLI validation output', () => {
        const injectedKey = 'APPLICANT-SECRET'
        let error: unknown

        try {
            validateAcceptedCandidate({ ...candidate, [injectedKey]: 'do not disclose' })
        } catch (caught) {
            error = caught
        }

        const formatted = formatCliError(error)
        expect({
            retainedSchemaPath: formatted.startsWith('<root>:'),
            exposedInjectedKey: formatted.includes(injectedKey),
        }).toEqual({ retainedSchemaPath: true, exposedInjectedKey: false })
    })

    it.each(['closed', 'unknown'])('rejects a candidate with %s status', (postStatus) => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    post: { ...post, postStatus },
                }),
            ),
        ).toContainEqual(['post', 'postStatus'])
    })

    it('rejects a source key outside the authoritative write contract', () => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    post: { ...post, sourceKey: 'x'.repeat(1_001) },
                }),
            ),
        ).toContainEqual(['post', 'sourceKey'])
    })

    it('preserves the authoritative path for a malformed URL', () => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    post: { ...post, applicationUrl: 'not-a-url' },
                }),
            ),
        ).toContainEqual(['post', 'applicationUrl'])
    })

    it.each([
        ['literal script markup', '<script>alert("x")</script>'],
        ['slash-delimited image markup', '<img/src=x>'],
        ['slash-delimited script markup', '<script/src=x>'],
        ['slash-delimited SVG markup', '<svg/onload=alert(1)>'],
        ['uppercase break markup', 'First line<BR>Second line'],
        ['uppercase paragraph markup', 'Text<P>Paragraph'],
        ['legacy markup', '<marquee>Browser chrome</marquee>'],
        ['named entities', 'Actual&nbsp;role &quot;quoted&quot;'],
        ['numeric entities', '&#169; Employer'],
        ['previously unlisted elements', '<section><span>Build the product.</span></section>'],
        ['numeric angle entities', '&#60;custom-element&#62;Role data&#60;/custom-element&#62;'],
        ['double-encoded elements', '&amp;lt;table&amp;gt;Role data&amp;lt;/table&amp;gt;'],
        [
            'single-encoded elements',
            '&lt;h1&gt;Software Engineer&lt;/h1&gt;&lt;p&gt;Build the product.&lt;/p&gt;',
        ],
    ])('rejects %s at the exact description path', (_description, description) => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    post: {
                        ...post,
                        description,
                    },
                }),
            ),
        ).toContainEqual(['post', 'description'])
    })

    it.each([
        ['ordinary comparisons', 'Use x < y && a > b when comparing bounds.'],
        ['TypeScript generic notation', 'Use Array<T> and Promise<Result> in the API.'],
        ['lowercase generic notation', 'Use Array<string> and Promise<boolean> in the API.'],
        ['generic-arrow notation', 'Use const identity = <T>(value: T) => value.'],
        ['constrained generic notation', 'Write <T extends object>(value: T).'],
        ['readonly generic notation', 'Use Array<readonly string[]> in the API.'],
        ['keyof generic notation', 'Use Array<keyof T> in the API.'],
        ['union generic notation', 'Use Array<T | null> in the API.'],
        ['const generic notation', 'Declare type Box<const T>.'],
    ])('allows plain-text %s without treating it as HTML', (_description, description) => {
        expect(() =>
            validateAcceptedCandidate({
                ...candidate,
                post: {
                    ...post,
                    description: `${description}\nResponsibilities\nBuild the product.`,
                },
            }),
        ).not.toThrow()
    })

    it('rejects a one-paragraph description summary', () => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    post: { ...post, description: 'Condensed description summary.'.repeat(50) },
                }),
            ),
        ).toContainEqual(['post', 'description'])
    })

    it.each([
        [
            'LinkedIn and Indeed',
            'https://www.linkedin.com/jobs/view/4450724106/',
            'https://apply.indeed.com/indeedapply/',
        ],
        [
            'Himalayas',
            'https://himalayas.app/companies/radity/jobs/typescript-software-engineer',
            'https://himalayas.app/signup/talent?redirect=%2Fcompanies%2Fradity%2Fjobs%2Ftypescript-software-engineer',
        ],
        [
            'Wellfound',
            'https://wellfound.com/jobs/4565953-forward-deployed-engineer',
            'https://wellfound.com/jobs/4565953-forward-deployed-engineer',
        ],
    ])('rejects a %s-only candidate', (_source, postUrl, applicationUrl) => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    post: { ...post, postUrl, applicationUrl },
                }),
            ),
        ).toEqual(
            expect.arrayContaining([
                ['post', 'postUrl'],
                ['post', 'applicationUrl'],
            ]),
        )
    })

    it('rejects local and IP application endpoints', () => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    post: {
                        ...post,
                        postUrl: 'http://localhost:3000/api/job-posts',
                        applicationUrl: 'http://127.0.0.1:3000/api/job-posts',
                    },
                }),
            ),
        ).toEqual(
            expect.arrayContaining([
                ['post', 'postUrl'],
                ['post', 'applicationUrl'],
            ]),
        )
    })

    it.each(['home.arpa', 'device.home.arpa', 'jobs.acme.example'])(
        'rejects the reserved non-public hostname %s',
        (hostname) => {
            expect(
                issuePaths(() =>
                    validateAcceptedCandidate({
                        ...candidate,
                        post: {
                            ...post,
                            postUrl: `https://${hostname}/jobs/1`,
                            applicationUrl: `https://${hostname}/jobs/1/apply`,
                        },
                    }),
                ),
            ).toEqual(
                expect.arrayContaining([
                    ['post', 'postUrl'],
                    ['post', 'applicationUrl'],
                ]),
            )
        },
    )

    it('rejects an oversized candidate before pool assembly', () => {
        expect(
            issuePaths(() =>
                validateAcceptedCandidate({
                    ...candidate,
                    post: {
                        ...post,
                        description: `Role\nResponsibilities\n${'x'.repeat(MAX_JOB_SEARCH_CANDIDATE_BYTES)}`,
                    },
                }),
            ),
        ).toContainEqual([])
    })

    it('prints compact validation metadata without description text', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-candidate-'))
        const candidatePath = join(directory, 'candidate.json')
        let output = ''
        const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            output += String(chunk)
            return true
        })

        try {
            await writeFile(candidatePath, JSON.stringify(candidate))
            await runCli(['candidate', candidatePath])

            expect({
                metadata: JSON.parse(output) as unknown,
                containsDescription: output.includes(candidate.post.description),
            }).toEqual({
                metadata: {
                    validated: true,
                    sourceKey: candidate.post.sourceKey,
                    serializedBytes: Buffer.byteLength(JSON.stringify(candidate)),
                },
                containsDescription: false,
            })
        } finally {
            write.mockRestore()
            await rm(directory, { recursive: true })
        }
    })

    it('rejects a non-regular opaque artifact path', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-candidate-directory-'))

        try {
            await expect(runCli(['candidate', directory])).rejects.toThrow(
                'Candidate artifact must be a regular file',
            )
        } finally {
            await rm(directory, { recursive: true })
        }
    })

    it('rejects malformed UTF-8 instead of mutating artifact bytes', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-candidate-encoding-'))
        const candidatePath = join(directory, 'candidate.json')

        try {
            await writeFile(candidatePath, Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]))
            await expect(runCli(['candidate', candidatePath])).rejects.toThrow(
                'Candidate artifact is not valid UTF-8',
            )
        } finally {
            await rm(directory, { recursive: true })
        }
    })

    it('rejects an oversized serialized pool before final judgment', () => {
        const description = `Role\nResponsibilities\n${'x'.repeat(MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES / 2)}`
        const pool = [
            {
                ...candidate,
                post: {
                    ...post,
                    sourceKey: 'company:first',
                    description,
                    postUrl: 'https://example.com/jobs/first',
                    applicationUrl: 'https://example.com/jobs/first/apply',
                },
            },
            {
                ...candidate,
                post: {
                    ...post,
                    sourceKey: 'company:second',
                    description,
                    postUrl: 'https://example.com/jobs/second',
                    applicationUrl: 'https://example.com/jobs/second/apply',
                },
            },
        ]

        expect(issuePaths(() => validateCandidatePool(pool))).toContainEqual([])
    })

    it('rejects duplicate identities in the current pool', () => {
        expect(issuePaths(() => validateCandidatePool([candidate, candidate]))).toContainEqual([
            1,
            'post',
            'sourceKey',
        ])
    })

    it('rejects a different source key with the same normalized canonical URL', () => {
        const duplicateUrlCandidate: StageCandidate = {
            ...candidate,
            post: {
                ...post,
                sourceKey: 'company:different-key',
                postUrl:
                    'https://EXAMPLE.com/jobs/software-engineer/?utm_source=search#job-description',
                applicationUrl: 'https://example.com/jobs/software-engineer/application/',
            },
        }

        expect(
            issuePaths(() => validateCandidatePool([candidate, duplicateUrlCandidate])),
        ).toContainEqual([1, 'post', 'sourceKey'])
    })

    it('accepts every discovered candidate beyond the old 24-candidate cap', () => {
        const candidates = Array.from({ length: 25 }, (_, index) => ({
            ...candidate,
            post: {
                ...post,
                sourceKey: `company:${index}`,
                postUrl: `https://example.com/jobs/${index}`,
                applicationUrl: `https://example.com/jobs/${index}/apply`,
            },
        }))

        expect(validateCandidatePool(candidates)).toHaveLength(25)
    })

    it('rejects an existing identity before writing the review file', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-artifact-'))
        const candidatesPath = join(directory, 'candidates.json')
        const existingPath = join(directory, 'existing.json')
        const reviewPath = join(directory, 'review.json')

        try {
            await writeFile(candidatesPath, JSON.stringify([candidate]))
            await writeFile(
                existingPath,
                JSON.stringify(createHistoryArtifacts([responsePost]).identities),
            )

            let error: unknown
            try {
                await runCli(['pool', candidatesPath, existingPath, reviewPath])
            } catch (caught) {
                error = caught
            }

            const outputExists = await access(reviewPath).then(
                () => true,
                () => false,
            )
            expect({
                issuePaths:
                    error instanceof z.ZodError
                        ? error.issues.map((issue) => issue.path)
                        : undefined,
                outputExists,
            }).toEqual({ issuePaths: [[0, 'post', 'sourceKey']], outputExists: false })
        } finally {
            await rm(directory, { recursive: true })
        }
    })

    it('mechanically removes existing and cross-worker duplicate candidates before judgment', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-deduplicate-'))
        const mergedPath = join(directory, 'merged.json')
        const existingPath = join(directory, 'existing.json')
        const candidatesPath = join(directory, 'candidates.json')
        const reviewPath = join(directory, 'review.json')
        const netNewCandidate: StageCandidate = {
            ...candidate,
            post: {
                ...post,
                sourceKey: 'company:net-new',
                postUrl: 'https://example.com/jobs/net-new',
                applicationUrl: 'https://example.com/jobs/net-new/apply',
            },
        }
        const crossWorkerDuplicate: StageCandidate = {
            ...netNewCandidate,
            post: {
                ...netNewCandidate.post,
                sourceKey: 'company:alternate-key',
                postUrl: 'https://EXAMPLE.com/jobs/net-new/?utm_source=second-worker',
                applicationUrl: 'https://example.com/jobs/net-new/application/',
            },
        }

        try {
            await Promise.all([
                writeFile(
                    mergedPath,
                    JSON.stringify([candidate, netNewCandidate, crossWorkerDuplicate]),
                ),
                writeFile(
                    existingPath,
                    JSON.stringify(createHistoryArtifacts([responsePost]).identities),
                ),
            ])
            await runCli(['pool', mergedPath, existingPath, candidatesPath, reviewPath])

            expect({
                candidates: JSON.parse(await readFile(candidatesPath, 'utf8')) as unknown,
                review: JSON.parse(await readFile(reviewPath, 'utf8')) as {
                    candidates: unknown[]
                },
            }).toEqual({
                candidates: [netNewCandidate],
                review: {
                    reviewDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
                    candidates: [netNewCandidate],
                },
            })
        } finally {
            await rm(directory, { recursive: true })
        }
    })

    it('gives judgment the complete bounded candidate facts', () => {
        expect(createReviewPacket([candidate], emptyHistoryIdentities)).toEqual({
            reviewDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
            candidates: [candidate],
        })
    })

    it('retains the independent serialized judgment-context ceiling', () => {
        const oversizedReview = `${JSON.stringify(reviewedCandidate)}${' '.repeat(MAX_JOB_SEARCH_REVIEW_BYTES)}`

        expect(issuePaths(() => validateSerializedReviewPacket(oversizedReview))).toContainEqual([])
    })
})

describe('judgment and report assembly', () => {
    const review = reviewedCandidate

    it('mechanically projects one exhaustive judgment into the ranked selection', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-judgment-'))
        const reviewPath = join(directory, 'review.json')
        const judgmentPath = join(directory, 'judgment.json')
        const selectionPath = join(directory, 'selection.json')
        const secondCandidate: StageCandidate = {
            ...candidate,
            post: {
                ...post,
                sourceKey: 'company:frontend-engineer',
                roleTitle: 'Frontend Engineer',
                postUrl: 'https://example.com/jobs/frontend-engineer',
                applicationUrl: 'https://example.com/jobs/frontend-engineer/apply',
            },
        }
        const completeReview = createReviewPacket(
            [candidate, secondCandidate],
            emptyHistoryIdentities,
        )
        const judgment: JudgmentArtifact = {
            reviewDigest: completeReview.reviewDigest,
            decisions: [
                {
                    sourceKey: secondCandidate.post.sourceKey,
                    verdict: 'quick-app',
                    fitRationale: 'The central frontend work transfers, with one material stretch.',
                    recommendedResume: 'frontend',
                    recommendedAction: 'Apply with the frontend resume and address the stretch.',
                },
                {
                    sourceKey: candidate.post.sourceKey,
                    verdict: 'reject',
                    rejectionReason:
                        'A defining responsibility is unsupported by documented evidence.',
                },
            ],
        }

        try {
            await Promise.all([
                writeFile(reviewPath, JSON.stringify(completeReview)),
                writeFile(judgmentPath, JSON.stringify(judgment)),
            ])
            await runCli(['judgment', reviewPath, judgmentPath, selectionPath])

            expect(JSON.parse(await readFile(selectionPath, 'utf8')) as unknown).toEqual({
                reviewDigest: completeReview.reviewDigest,
                selections: [
                    {
                        sourceKey: secondCandidate.post.sourceKey,
                        agentLabel: 'quick-app',
                        fitRationale:
                            'The central frontend work transfers, with one material stretch.',
                        recommendedResume: 'frontend',
                        recommendedAction:
                            'Apply with the frontend resume and address the stretch.',
                    },
                ],
            })
        } finally {
            await rm(directory, { recursive: true })
        }
    })

    it('rejects a judgment that does not account for every reviewed candidate', () => {
        const incompleteJudgment: JudgmentArtifact = {
            reviewDigest: review.reviewDigest,
            decisions: [],
        }

        expect(
            issuePaths(() => createSelectionFromJudgment(review, incompleteJudgment)),
        ).toContainEqual(['decisions'])
    })

    it('retains the bounded judgment artifact ceiling', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-judgment-size-'))
        const reviewPath = join(directory, 'review.json')
        const judgmentPath = join(directory, 'judgment.json')
        const selectionPath = join(directory, 'selection.json')
        const file = await open(judgmentPath, 'w')

        try {
            await file.truncate(MAX_JOB_SEARCH_JUDGMENT_BYTES + 1)
            await file.close()
            await writeFile(reviewPath, JSON.stringify(review))

            await expect(
                runCli(['judgment', reviewPath, judgmentPath, selectionPath]),
            ).rejects.toThrow(
                `Judgment artifact exceeds the ${MAX_JOB_SEARCH_JUDGMENT_BYTES}-byte limit`,
            )
        } finally {
            await file.close().catch(() => undefined)
            await rm(directory, { recursive: true })
        }
    })

    it('reports malformed bounded coverage at exact field paths', () => {
        const malformedCoverage = structuredClone(coverage)
        malformedCoverage.sources[1]!.lane = 'linkedin'
        malformedCoverage.sources[3]!.operations = []

        expect(issuePaths(() => validateCoverage(malformedCoverage))).toEqual(
            expect.arrayContaining([
                ['sources', 1, 'lane'],
                ['sources', 3, 'blocker'],
            ]),
        )
    })

    it('rejects a query operation without an objective completion marker', () => {
        const missingCompletion = structuredClone(coverage) as {
            sources: Array<{ operations: Array<{ completion?: string }> }>
        }
        delete missingCompletion.sources[0]!.operations[0]!.completion

        expect(issuePaths(() => validateCoverage(missingCompletion))).toContainEqual([
            'sources',
            0,
            'operations',
            0,
            'completion',
        ])
    })

    it('rejects a public-web substitute for required Chrome coverage at its exact path', () => {
        const wrongMethodCoverage = structuredClone(coverage)
        wrongMethodCoverage.sources[0]!.accessMethod = 'public-long-tail'

        expect(issuePaths(() => validateCoverage(wrongMethodCoverage))).toContainEqual([
            'sources',
            0,
            'accessMethod',
        ])
    })

    it('rejects coverage with fewer than three completed lanes', () => {
        const weakCoverage = structuredClone(coverage)
        weakCoverage.sources.slice(2).forEach((source) => {
            source.operations = []
            source.blocker = 'Source access was blocked.'
        })

        expect(issuePaths(() => validateCoverage(weakCoverage, true))).toEqual([['sources']])
    })

    it.each([
        ['a missing variant', ['Application engineer, posted within three days']],
        [
            'a case-only replay',
            [
                'Application engineer, posted within three days',
                'APPLICATION ENGINEER, POSTED WITHIN THREE DAYS',
            ],
        ],
        [
            'too few distinct variants',
            [
                'Application engineer, posted within three days',
                'Frontend engineer, posted within three days',
            ],
        ],
    ])('rejects %s when a lane is unblocked', (_description, queries) => {
        const incompleteNativeCoverage = structuredClone(coverage)
        incompleteNativeCoverage.sources[0]!.operations = queries.map((query) => ({
            query,
            completion: 'two-pages-reviewed',
        }))

        expect(issuePaths(() => validateCoverage(incompleteNativeCoverage))).toContainEqual([
            'sources',
            0,
            'operations',
        ])
    })

    it('rejects a sparse oversized coverage file before allocating its contents', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-coverage-size-'))
        const coveragePath = join(directory, 'coverage.json')
        const candidatesPath = join(directory, 'candidates.json')
        const file = await open(coveragePath, 'w')

        try {
            await file.truncate(MAX_JOB_SEARCH_COVERAGE_BYTES + 1)
            await file.close()
            await writeFile(candidatesPath, JSON.stringify([candidate]))

            await expect(runCli(['coverage', coveragePath, candidatesPath])).rejects.toThrow(
                `Coverage artifact exceeds the ${MAX_JOB_SEARCH_COVERAGE_BYTES}-byte limit`,
            )
        } finally {
            await file.close().catch(() => undefined)
            await rm(directory, { recursive: true })
        }
    })

    it('does not echo malformed artifact contents in JSON errors', () => {
        const secret = 'APPLICANT-SECRET'
        let error: unknown

        try {
            validateSerializedCoverage(secret)
        } catch (caught) {
            error = caught
        }

        expect({
            message: error instanceof Error ? error.message : null,
            leaked: error instanceof Error && error.message.includes(secret),
        }).toEqual({ message: 'Coverage artifact is not valid JSON', leaked: false })
    })

    it('stops the CLI handoff when coverage is structurally valid but unreliable', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-coverage-'))
        const coveragePath = join(directory, 'coverage.json')
        const candidatesPath = join(directory, 'candidates.json')
        const weakCoverage = structuredClone(coverage)
        weakCoverage.sources.slice(2).forEach((source) => {
            source.operations = []
            source.blocker = 'Source access was blocked.'
        })

        try {
            await writeFile(coveragePath, JSON.stringify(weakCoverage))
            await writeFile(candidatesPath, JSON.stringify([candidate]))

            let error: unknown
            try {
                await runCli(['coverage', coveragePath, candidatesPath])
            } catch (caught) {
                error = caught
            }

            expect(
                error instanceof z.ZodError ? error.issues.map((issue) => issue.path) : [],
            ).toEqual([['sources']])
        } finally {
            await rm(directory, { recursive: true })
        }
    })

    it.each([
        [
            'a duplicate selection',
            {
                reviewDigest: review.reviewDigest,
                selections: [selectedRecommendation, selectedRecommendation],
            },
            ['selections', 1, 'sourceKey'],
        ],
        [
            'an unknown selection',
            {
                reviewDigest: review.reviewDigest,
                selections: [{ ...selectedRecommendation, sourceKey: 'company:not-in-review' }],
            },
            ['selections', 0, 'sourceKey'],
        ],
        [
            'a legacy resume without a current artifact',
            {
                reviewDigest: review.reviewDigest,
                selections: [{ ...selectedRecommendation, recommendedResume: 'general' }],
            },
            ['selections', 0, 'recommendedResume'],
        ],
    ])('rejects %s at its exact field', (_description, value, expectedPath) => {
        expect(issuePaths(() => validateSelection(review, value))).toContainEqual(expectedPath)
    })

    it('lets judgment own the verdict, resume, rationale, action, and rank', () => {
        const secondCandidate: StageCandidate = {
            ...candidate,
            post: {
                ...post,
                sourceKey: 'company:frontend-engineer',
                roleTitle: 'Frontend Engineer',
                postUrl: 'https://example.com/jobs/frontend-engineer',
                applicationUrl: 'https://example.com/jobs/frontend-engineer/apply',
            },
        }
        const judgment: SelectionArtifact = {
            reviewDigest: createReviewPacket([candidate, secondCandidate], emptyHistoryIdentities)
                .reviewDigest,
            selections: [
                {
                    sourceKey: secondCandidate.post.sourceKey,
                    agentLabel: 'quick-app',
                    fitRationale: 'Judgment-specific lower-priority rationale.',
                    recommendedResume: 'frontend',
                    recommendedAction: 'Use the frontend resume and verify the account flow.',
                },
                selectedRecommendation,
            ],
        }
        const { sourceKey: firstSourceKey, ...firstRecommendation } = judgment.selections[0]!
        const { sourceKey: secondSourceKey, ...secondRecommendation } = judgment.selections[1]!
        void firstSourceKey
        void secondSourceKey
        const report = assembleFinalReport([candidate, secondCandidate], judgment, coverage)
        const oneSelectionSummary = assembleFinalReport(
            [candidate, secondCandidate],
            { ...judgment, selections: judgment.selections.slice(0, 1) },
            coverage,
        ).summary

        expect({
            summaryIsBlank: report.summary.trim().length === 0,
            summaryChangedWithJudgmentExclusion: report.summary !== oneSelectionSummary,
            results: report.results,
        }).toEqual({
            summaryIsBlank: false,
            summaryChangedWithJudgmentExclusion: true,
            results: [
                {
                    agentRank: 1,
                    ...firstRecommendation,
                    applicationFlow: secondCandidate.applicationFlow,
                    keyLegitimacySignals: secondCandidate.keyLegitimacySignals,
                    legitimacyNotes: secondCandidate.legitimacyNotes,
                    post: secondCandidate.post,
                },
                {
                    agentRank: 2,
                    ...secondRecommendation,
                    applicationFlow: candidate.applicationFlow,
                    keyLegitimacySignals: candidate.keyLegitimacySignals,
                    legitimacyNotes: candidate.legitimacyNotes,
                    post: candidate.post,
                },
            ],
        })
    })

    it('assembles the CLI payload without a model-authored summary artifact', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-assemble-'))
        const candidatesPath = join(directory, 'candidates.json')
        const selectionPath = join(directory, 'selection.json')
        const coveragePath = join(directory, 'coverage.json')
        const payloadPath = join(directory, 'payload.json')

        try {
            await Promise.all([
                writeFile(candidatesPath, JSON.stringify([candidate])),
                writeFile(selectionPath, JSON.stringify(selection)),
                writeFile(coveragePath, JSON.stringify(coverage)),
            ])
            await runCli(['assemble', candidatesPath, selectionPath, coveragePath, payloadPath])

            expect(JSON.parse(await readFile(payloadPath, 'utf8')) as unknown).toEqual(
                assembleFinalReport([candidate], selection, coverage),
            )
        } finally {
            await rm(directory, { recursive: true })
        }
    })

    it('rejects candidate facts changed after judgment at the digest path', () => {
        const tamperedReview = structuredClone(review)
        tamperedReview.candidates[0]!.post.roleTitle = 'Tampered role title'

        expect(issuePaths(() => validateSelection(tamperedReview, selection))).toContainEqual([
            'reviewDigest',
        ])
    })

    it('rejects a full description changed after judgment at the digest path', () => {
        const changedCandidate: StageCandidate = {
            ...candidate,
            post: {
                ...candidate.post,
                description: `${candidate.post.description} Changed after judgment.`,
            },
        }

        expect(
            issuePaths(() => assembleFinalReport([changedCandidate], selection, coverage)),
        ).toContainEqual(['reviewDigest'])
    })

    it('allows a reliable run with zero candidates', () => {
        const report = assembleFinalReport(
            [],
            {
                reviewDigest: createReviewPacket([], emptyHistoryIdentities).reviewDigest,
                selections: [],
            },
            coverage,
        )

        expect({
            results: report.results,
            summaryIsBlank: report.summary.trim().length === 0,
        }).toEqual({ results: [], summaryIsBlank: false })
    })

    it('retains the final API request-size guard', () => {
        const oversizedReport = JSON.stringify({
            summary: 'One match',
            results: [
                {
                    agentRank: 1,
                    agentLabel: 'target',
                    fitRationale: 'Direct fit.',
                    applicationFlow: 'Direct.',
                    keyLegitimacySignals: 'Employer page.',
                    recommendedResume: 'frontend',
                    recommendedAction: 'Apply.',
                    legitimacyNotes: null,
                    post: { ...post, description: 'x'.repeat(MAX_JSON_REQUEST_BYTES) },
                },
            ],
        })

        expect(issuePaths(() => validateSerializedReport(oversizedReport))).toContainEqual([])
    })
})

const reportDate = '2026-08-09'
const reportId = '22222222-2222-4222-8222-222222222222'
const payload: UpsertJobSearchReportInput = assembleFinalReport([candidate], selection, coverage)

describe('deterministic Markdown reporting', () => {
    it('makes every report-visible field affect deterministic rendering', () => {
        type Mutation = (
            changedPayload: UpsertJobSearchReportInput,
            changedCoverage: JobSearchCoverage,
        ) => void
        const mutations: Record<string, Mutation> = {
            summary: (changed) => void (changed.summary += ' Changed.'),
            rank: (changed) => void (changed.results[0]!.agentRank += 1),
            verdict: (changed) => void (changed.results[0]!.agentLabel = 'quick-app'),
            rationale: (changed) => void (changed.results[0]!.fitRationale += ' Changed.'),
            flow: (changed) => void (changed.results[0]!.applicationFlow += ' Changed.'),
            signals: (changed) => void (changed.results[0]!.keyLegitimacySignals += ' Changed.'),
            resume: (changed) => void (changed.results[0]!.recommendedResume = 'frontend'),
            action: (changed) => void (changed.results[0]!.recommendedAction += ' Changed.'),
            concerns: (changed) => void (changed.results[0]!.legitimacyNotes = 'Changed.'),
            role: (changed) => void (changed.results[0]!.post.roleTitle += ' Changed'),
            company: (changed) => void (changed.results[0]!.post.company += ' Changed'),
            location: (changed) => void (changed.results[0]!.post.location = 'Changed'),
            compensation: (changed) => void (changed.results[0]!.post.compensation = 'Changed'),
            stack: (changed) => void (changed.results[0]!.post.techStack += ', Changed'),
            source: (changed) => void (changed.results[0]!.post.postSource += ' Changed'),
            postUrl: (changed) => void (changed.results[0]!.post.postUrl += '?changed=1'),
            applicationUrl: (changed) =>
                void (changed.results[0]!.post.applicationUrl += '?changed=1'),
            lane: (_changed, changedCoverage) => {
                const direct = changedCoverage.sources[3]!
                const longTail = changedCoverage.sources[4]!
                ;[direct.lane, longTail.lane] = [longTail.lane, direct.lane]
                ;[direct.accessMethod, longTail.accessMethod] = [
                    longTail.accessMethod,
                    direct.accessMethod,
                ]
            },
            query: (_changed, changedCoverage) =>
                void (changedCoverage.sources[0]!.operations[0]!.query += ' changed'),
            completion: (_changed, changedCoverage) =>
                void (changedCoverage.sources[0]!.operations[0]!.completion =
                    'all-results-reviewed'),
            blocker: (_changed, changedCoverage) =>
                void (changedCoverage.sources[0]!.blocker = 'Changed.'),
        }
        const baseline = renderJobSearchMarkdown(reportDate, reportId, payload, coverage)
        const unchanged = Object.entries(mutations)
            .filter(([, mutate]) => {
                const changedPayload = structuredClone(payload)
                const changedCoverage = structuredClone(coverage)
                mutate(changedPayload, changedCoverage)
                return (
                    renderJobSearchMarkdown(
                        reportDate,
                        reportId,
                        changedPayload,
                        changedCoverage,
                    ) === baseline
                )
            })
            .map(([name]) => name)

        if (renderJobSearchMarkdown('2026-08-10', reportId, payload, coverage) === baseline) {
            unchanged.push('reportDate')
        }
        if (
            renderJobSearchMarkdown(
                reportDate,
                '33333333-3333-4333-8333-333333333333',
                payload,
                coverage,
            ) === baseline
        ) {
            unchanged.push('reportId')
        }

        expect(unchanged).toEqual([])
    })

    it('escapes source values that could break a Markdown table cell', () => {
        const escapedCandidate: StageCandidate = {
            ...candidate,
            post: {
                ...post,
                roleTitle: 'Engineer | <script>',
            },
        }
        const escapedPayload = assembleFinalReport(
            [escapedCandidate],
            {
                ...selection,
                reviewDigest: createReviewPacket([escapedCandidate], emptyHistoryIdentities)
                    .reviewDigest,
            },
            coverage,
        )

        expect(renderJobSearchMarkdown(reportDate, reportId, escapedPayload, coverage)).toContain(
            'Engineer \\| &lt;script&gt;',
        )
    })

    it('renders untrusted GFM syntax inert while keeping URL cells usable', () => {
        const untrustedMarkdown =
            '![image](https://attacker.invalid/image.png) [link](https://attacker.invalid) `code` *emphasis* _italic_ ~~strike~~\n# attacker-heading\n- attacker-list'
        const escapedCandidate: StageCandidate = {
            ...candidate,
            post: { ...post, roleTitle: untrustedMarkdown },
        }
        const escapedPayload = assembleFinalReport(
            [escapedCandidate],
            {
                ...selection,
                reviewDigest: createReviewPacket([escapedCandidate], emptyHistoryIdentities)
                    .reviewDigest,
            },
            coverage,
        )
        const markdown = renderJobSearchMarkdown(reportDate, reportId, escapedPayload, coverage)
        const activePayloadSyntax = [
            '![image](https://attacker.invalid/image.png)',
            '[link](https://attacker.invalid)',
            '`code`',
            '*emphasis*',
            '_italic_',
            '~~strike~~',
        ].filter((syntax) => markdown.includes(syntax))

        expect({
            activePayloadSyntax,
            usablePostUrl: markdown.includes(`](${post.postUrl})`),
            usableApplicationUrl: markdown.includes(`](${post.applicationUrl})`),
        }).toEqual({
            activePayloadSyntax: [],
            usablePostUrl: true,
            usableApplicationUrl: true,
        })
    })

    it('detects a stale or truncated rendered report', () => {
        expect(
            issuePaths(() =>
                verifyRenderedMarkdown(reportDate, reportId, payload, coverage, '# stale\n'),
            ),
        ).toContainEqual(['markdown'])
    })
})

const responsePost: JobPost = {
    id: '11111111-1111-4111-8111-111111111111',
    sourceKey: post.sourceKey,
    roleTitle: post.roleTitle,
    company: post.company,
    location: post.location,
    compensation: post.compensation,
    techStack: post.techStack,
    postSource: post.postSource,
    postUrl: post.postUrl,
    applicationUrl: post.applicationUrl,
    postStatus: post.postStatus,
    applicationStatus: 'not-applied',
    appliedAt: null,
    userLabel: null,
    archivedAt: null,
    createdAt: '2026-08-09T12:00:00.000Z',
    updatedAt: '2026-08-09T12:00:00.000Z',
}

describe('saved job history boundary', () => {
    it('validates the authoritative API response before writing either artifact', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-history-invalid-'))
        const responsePath = join(directory, 'job-posts.json')
        const identitiesPath = join(directory, 'identities.json')
        const feedbackPath = join(directory, 'feedback.json')

        try {
            await writeFile(
                responsePath,
                JSON.stringify([{ ...responsePost, applicationStatus: 'applied' }]),
            )

            let error: unknown
            try {
                await runCli(['history', responsePath, identitiesPath, feedbackPath])
            } catch (caught) {
                error = caught
            }

            const zodError =
                error instanceof Error && error.cause instanceof z.ZodError ? error.cause : null
            const [identitiesExist, feedbackExists] = await Promise.all(
                [identitiesPath, feedbackPath].map((path) =>
                    access(path).then(
                        () => true,
                        () => false,
                    ),
                ),
            )

            expect({
                paths: zodError?.issues.map((issue) => issue.path),
                identitiesExist,
                feedbackExists,
            }).toEqual({
                paths: [[0, 'applicationStatus']],
                identitiesExist: false,
                feedbackExists: false,
            })
        } finally {
            await rm(directory, { recursive: true })
        }
    })

    it('keeps every unlabeled identity while excluding it from compact feedback', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-history-'))
        const responsePath = join(directory, 'job-posts.json')
        const identitiesPath = join(directory, 'identities.json')
        const feedbackPath = join(directory, 'feedback.json')
        let output = ''
        const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            output += String(chunk)
            return true
        })

        try {
            await writeFile(responsePath, JSON.stringify([responsePost]))
            await runCli(['history', responsePath, identitiesPath, feedbackPath])

            const identities = JSON.parse(await readFile(identitiesPath, 'utf8')) as {
                identityDigests: string[]
            }
            const feedback = JSON.parse(await readFile(feedbackPath, 'utf8')) as {
                posts: unknown[]
                omittedPosts: number
            }

            expect({
                identities,
                feedback,
                metadata: JSON.parse(output) as unknown,
            }).toEqual({
                identities: {
                    identityDigests: [
                        expect.stringMatching(/^[a-f0-9]{64}$/),
                        expect.stringMatching(/^[a-f0-9]{64}$/),
                    ],
                },
                feedback: { posts: [], omittedPosts: 0 },
                metadata: {
                    validated: true,
                    posts: 1,
                    identities: identities.identityDigests.length,
                    feedbackPosts: feedback.posts.length,
                    feedbackOmittedPosts: feedback.omittedPosts,
                    identitiesBytes: Buffer.byteLength(JSON.stringify(identities)),
                    feedbackBytes: Buffer.byteLength(JSON.stringify(feedback)),
                },
            })
        } finally {
            write.mockRestore()
            await rm(directory, { recursive: true })
        }
    })

    it('includes only labeled or applied posts in compact feedback', () => {
        const labeledPost: JobPost = {
            ...responsePost,
            id: '33333333-3333-4333-8333-333333333333',
            sourceKey: 'company:labeled-role',
            roleTitle: 'Labeled Role',
            userLabel: 'P1',
        }
        const appliedPost: JobPost = {
            ...responsePost,
            id: '44444444-4444-4444-8444-444444444444',
            sourceKey: 'company:applied-role',
            roleTitle: 'Applied Role',
            applicationStatus: 'awaiting-response',
            appliedAt: '2026-08-08T12:00:00.000Z',
        }

        expect(createHistoryArtifacts([responsePost, labeledPost, appliedPost]).feedback).toEqual({
            posts: [
                {
                    title: appliedPost.roleTitle,
                    company: appliedPost.company,
                    location: appliedPost.location,
                    compensation: appliedPost.compensation,
                    techStack: appliedPost.techStack,
                    postSource: appliedPost.postSource,
                    userLabel: appliedPost.userLabel,
                    applicationStatus: appliedPost.applicationStatus,
                    appliedAt: appliedPost.appliedAt,
                },
                {
                    title: labeledPost.roleTitle,
                    company: labeledPost.company,
                    location: labeledPost.location,
                    compensation: labeledPost.compensation,
                    techStack: labeledPost.techStack,
                    postSource: labeledPost.postSource,
                    userLabel: labeledPost.userLabel,
                    applicationStatus: labeledPost.applicationStatus,
                    appliedAt: labeledPost.appliedAt,
                },
            ],
            omittedPosts: 0,
        })
    })

    it('derives bounded artifacts from legacy rows accepted by the read contract', () => {
        const legacyPost: JobPost = {
            ...responsePost,
            sourceKey: 'x'.repeat(1_001),
            roleTitle: 'Role '.repeat(2_000),
            company: 'Company '.repeat(2_000),
            techStack: 'TypeScript '.repeat(2_000),
            postSource: 'Legacy import '.repeat(2_000),
            userLabel: 'P1',
        }

        const { identities, feedback } = createHistoryArtifacts([legacyPost])

        expect({
            identities: identities.identityDigests,
            feedbackPosts: feedback.posts.length,
            omittedPosts: feedback.omittedPosts,
            boundedFields: feedback.posts.map(({ title, company, techStack, postSource }) => ({
                title: title.length,
                company: company.length,
                techStack: techStack.length,
                postSource: postSource.length,
            })),
        }).toEqual({
            identities: [
                expect.stringMatching(/^[a-f0-9]{64}$/),
                expect.stringMatching(/^[a-f0-9]{64}$/),
            ],
            feedbackPosts: 1,
            omittedPosts: 0,
            boundedFields: [{ title: 500, company: 500, techStack: 2_000, postSource: 500 }],
        })
    })

    it('omits oldest preference excerpts instead of failing an oversized legacy history', () => {
        const legacyPosts = Array.from({ length: 100 }, (_, index): JobPost => {
            const suffix = String(index).padStart(12, '0')
            return {
                ...responsePost,
                id: `00000000-0000-4000-8000-${suffix}`,
                sourceKey: `legacy:${index}:${'x'.repeat(1_001)}`,
                roleTitle: `Role ${index} ${'x'.repeat(2_000)}`,
                company: `Company ${index} ${'x'.repeat(2_000)}`,
                techStack: `TypeScript ${'x'.repeat(4_000)}`,
                postSource: `Legacy import ${'x'.repeat(2_000)}`,
                postUrl: `https://example.com/jobs/legacy-${index}`,
                applicationUrl: `https://example.com/jobs/legacy-${index}/apply`,
                userLabel: 'P1',
                updatedAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
            }
        })

        const { feedback } = createHistoryArtifacts(legacyPosts)
        const retainedIndexes = feedback.posts.map(({ title }) => Number(title.split(' ')[1]))

        expect({
            accountedPosts: feedback.posts.length + feedback.omittedPosts,
            omittedSome: feedback.omittedPosts > 0,
            retainedIndexes,
            withinByteLimit:
                Buffer.byteLength(JSON.stringify(feedback)) <=
                MAX_JOB_SEARCH_HISTORY_FEEDBACK_BYTES,
        }).toEqual({
            accountedPosts: legacyPosts.length,
            omittedSome: true,
            retainedIndexes: Array.from(
                { length: feedback.posts.length },
                (_, offset) => legacyPosts.length - offset - 1,
            ),
            withinByteLimit: true,
        })
    })

    it('derives every identity from a maximum-size valid history response', () => {
        const history: JobPost[] = []
        let serializedBytes = 2

        for (let index = 0; ; index += 1) {
            const baseId = index * 4
            const historicalPost: JobPost = {
                id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                sourceKey: `s${index}`,
                roleTitle: 'r',
                company: 'c',
                location: null,
                compensation: null,
                techStack: 't',
                postSource: 'p',
                postUrl: `http://a.greenhouse.io/jobs/${baseId + 1}?gh_jid=${baseId + 2}`,
                applicationUrl: `http://a.greenhouse.io/jobs/${baseId + 3}?gh_jid=${baseId + 4}`,
                postStatus: 'active',
                applicationStatus: 'not-applied',
                appliedAt: null,
                userLabel: null,
                archivedAt: null,
                createdAt: '2026-08-09T00:00:00.000Z',
                updatedAt: '2026-08-09T00:00:00.000Z',
            }
            const postBytes = Buffer.byteLength(JSON.stringify(historicalPost))
            const nextBytes = serializedBytes + postBytes + (history.length === 0 ? 0 : 1)

            if (nextBytes > MAX_JOB_SEARCH_HISTORY_RESPONSE_BYTES) {
                break
            }

            history.push(historicalPost)
            serializedBytes = nextBytes
        }

        const { identities } = createHistoryArtifacts(history)

        expect({
            filledInputBudget: serializedBytes > MAX_JOB_SEARCH_HISTORY_RESPONSE_BYTES - 1_024,
            preservedIdentities: identities.identityDigests.length,
            outputWithinBudget:
                Buffer.byteLength(JSON.stringify(identities)) <=
                MAX_JOB_SEARCH_HISTORY_IDENTITY_BYTES,
        }).toEqual({
            filledInputBudget: true,
            preservedIdentities: history.length * 7,
            outputWithinBudget: true,
        })
    })

    it('rejects a Greenhouse canonical candidate matching an employer wrapper gh_jid', () => {
        const historicalPost: JobPost = {
            ...responsePost,
            sourceKey: 'employer:historical-key',
            postUrl:
                'https://careers.example.com/jobs/software-engineer?gh_jid=1234567&utm_source=board',
            applicationUrl:
                'https://careers.example.com/jobs/software-engineer/apply?gh_jid=1234567',
        }
        const greenhouseCandidate: StageCandidate = {
            ...candidate,
            post: {
                ...post,
                sourceKey: 'greenhouse:different-key',
                postUrl: 'https://job-boards.greenhouse.io/example/jobs/1234567',
                applicationUrl: 'https://job-boards.greenhouse.io/example/jobs/1234567/application',
            },
        }
        const { identities } = createHistoryArtifacts([historicalPost])

        expect(
            issuePaths(() => createReviewPacket([greenhouseCandidate], identities)),
        ).toContainEqual([0, 'post', 'sourceKey'])
    })
})

const response: JobSearchReport = {
    id: reportId,
    reportDate,
    summary: payload.summary,
    createdAt: '2026-08-09T12:00:00.000Z',
    updatedAt: '2026-08-09T12:00:00.000Z',
    archivedAt: null,
    results: [
        {
            ...payload.results[0]!,
            post: responsePost,
            jobPostSnapshot: {
                description: payload.results[0]!.post.description,
                sourceUrl: payload.results[0]!.post.postUrl,
                capturedAt: '2026-08-09T12:00:00.000Z',
            },
        },
    ],
}

describe('delivery verification', () => {
    it('runs the remaining delivery commands through the CLI', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'job-search-delivery-'))
        const reviewPath = join(directory, 'review.json')
        const selectionPath = join(directory, 'selection.json')
        const payloadPath = join(directory, 'payload.json')
        const coveragePath = join(directory, 'coverage.json')
        const responsePath = join(directory, 'response.json')
        const markdownPath = join(directory, 'report.md')
        const findUnique = vi.fn(async () => ({
            results: [
                {
                    agentRank: 1,
                    post: {
                        sourceKey: post.sourceKey,
                        snapshot: { sourceUrl: post.postUrl, description: post.description },
                    },
                },
            ],
        }))
        const disconnect = vi.fn(async () => undefined)
        let output = ''
        const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            output += String(chunk)
            return true
        })

        vi.doMock('../src/db/prisma.ts', () => ({
            prisma: {
                jobSearchReport: { findUnique },
                $disconnect: disconnect,
            },
        }))

        try {
            await Promise.all([
                writeFile(reviewPath, JSON.stringify(reviewedCandidate)),
                writeFile(selectionPath, JSON.stringify(selection)),
                writeFile(payloadPath, JSON.stringify(payload)),
                writeFile(coveragePath, JSON.stringify(coverage)),
                writeFile(responsePath, JSON.stringify(response)),
            ])

            await runCli(['selection', reviewPath, selectionPath])
            await runCli(['report', payloadPath])
            await runCli(['render', reportDate, reportId, payloadPath, coveragePath, markdownPath])
            await runCli(['verify', reportDate, reportId, payloadPath, responsePath])
            await runCli(['verify-storage', reportId, payloadPath])
            await runCli([
                'verify-markdown',
                reportDate,
                reportId,
                payloadPath,
                coveragePath,
                markdownPath,
            ])

            const [selectionOutput, reportOutput, ...statuses] = output.trim().split('\n')

            expect({
                selection: JSON.parse(selectionOutput!),
                report: JSON.parse(reportOutput!),
                statuses,
                markdown: await readFile(markdownPath, 'utf8'),
            }).toEqual({
                selection,
                report: payload,
                statuses: ['verified', 'verified', 'verified'],
                markdown: renderJobSearchMarkdown(reportDate, reportId, payload, coverage),
            })
            expect(findUnique).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ where: { id: reportId } }),
            )
            expect(disconnect).toHaveBeenCalledOnce()
        } finally {
            write.mockRestore()
            vi.doUnmock('../src/db/prisma.ts')
            await rm(directory, { recursive: true })
        }
    })

    it('reports an API mismatch at the exact response path', () => {
        const mismatchedResponse = structuredClone(response)
        mismatchedResponse.results[0]!.post.techStack = 'Python'

        expect(
            issuePaths(() => verifyApiResponse(reportDate, reportId, payload, mismatchedResponse)),
        ).toContainEqual(['results', 0, 'post', 'techStack'])
    })

    it('rejects a response that exposes an omitted description', () => {
        const leakingResponse = structuredClone(response) as JobSearchReport & {
            results: Array<{ post: JobPost & { description: string } }>
        }
        leakingResponse.results[0]!.post.description = post.description

        expect(
            issuePaths(() => verifyApiResponse(reportDate, reportId, payload, leakingResponse)),
        ).toContainEqual(['results', 0, 'post'])
    })

    it('does not echo an unexpected API response key through CLI validation output', () => {
        const injectedKey = 'APPLICANT-SECRET'
        const injectedResponse = { ...response, [injectedKey]: 'do not disclose' }
        let error: unknown

        try {
            verifyApiResponse(reportDate, reportId, payload, injectedResponse)
        } catch (caught) {
            error = caught
        }

        const formatted = formatCliError(error)
        expect({
            retainedSchemaPath: formatted.startsWith('<root>:'),
            exposedInjectedKey: formatted.includes(injectedKey),
        }).toEqual({ retainedSchemaPath: true, exposedInjectedKey: false })
    })

    it('reports a stored description mismatch at the exact payload path', () => {
        const stored: StoredDescriptionResult[] = [
            {
                agentRank: 1,
                sourceKey: post.sourceKey,
                sourceUrl: post.postUrl,
                description: 'Truncated description',
            },
        ]

        expect(issuePaths(() => verifyStoredDescriptions(payload, stored))).toContainEqual([
            'results',
            0,
            'post',
            'description',
        ])
    })
})
