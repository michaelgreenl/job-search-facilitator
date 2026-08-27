import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import {
    APPLICATION_STATUSES,
    jobPostInputSchema,
    MAX_JSON_REQUEST_BYTES,
    parseJobSearchReport,
    parseJobPosts,
    standaloneJobRecommendationInputSchema,
    USER_LABELS,
    type JobPostInput,
    type JobSearchReport,
    type UpsertJobSearchReportInput,
} from '@job-search-facilitator/core'
import { z, type RefinementCtx } from 'zod'
import { upsertJobSearchReportInputSchema } from './api/schemas/search-report.schema.ts'
import { identityTokensForPost } from './job-post-identity.ts'

export const MAX_JOB_SEARCH_CANDIDATE_BYTES = 128 * 1024
export const MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES = MAX_JSON_REQUEST_BYTES
export const MAX_JOB_SEARCH_REVIEW_BYTES = MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES + 1024
export const MAX_JOB_SEARCH_JUDGMENT_BYTES = MAX_JSON_REQUEST_BYTES
export const MAX_JOB_SEARCH_SELECTION_BYTES = MAX_JSON_REQUEST_BYTES
export const MAX_JOB_SEARCH_COVERAGE_BYTES = 64 * 1024
export const MAX_JOB_SEARCH_HISTORY_RESPONSE_BYTES = 8 * 1024 * 1024
export const MAX_JOB_SEARCH_HISTORY_IDENTITY_BYTES = MAX_JOB_SEARCH_HISTORY_RESPONSE_BYTES * 2
export const MAX_JOB_SEARCH_HISTORY_FEEDBACK_BYTES = 256 * 1024

const boundedLegitimacyNotesSchema =
    standaloneJobRecommendationInputSchema.shape.legitimacyNotes.refine(
        (value) => value === null || value.length <= 1_000,
        { message: 'Legitimacy notes must contain at most 1000 characters' },
    )

const candidateShape = {
    post: jobPostInputSchema,
    applicationFlow: standaloneJobRecommendationInputSchema.shape.applicationFlow.max(1_500),
    keyLegitimacySignals:
        standaloneJobRecommendationInputSchema.shape.keyLegitimacySignals.max(1_500),
    legitimacyNotes: boundedLegitimacyNotesSchema,
}

const discoveryOnlyHosts = [
    'builtin.com',
    'dice.com',
    'himalayas.app',
    'indeed.com',
    'jobicy.com',
    'linkedin.com',
    'remoteok.com',
    'wellfound.com',
    'workatastartup.com',
    'ycombinator.com',
]
const employerUrlFields = ['postUrl', 'applicationUrl'] as const
const MAX_MARKUP_ENTITY_DECODE_PASSES = 4
const tagShapedHtmlPattern = /<\/?([A-Za-z][A-Za-z0-9:-]*)(?=[\s/>])[^<>]*>/g
const knownHtmlTags = new Set(
    'a abbr acronym address applet area article aside audio b base basefont bdi bdo bgsound big blink blockquote body br button canvas caption center cite code col colgroup command content data datalist dd del details dfn dialog dir div dl dt element em embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe image img input ins kbd label legend li link main map mark marquee menu menuitem meta meter nav nobr noembed noframes noscript object ol optgroup option output p param picture plaintext portal pre progress q rb rp rt rtc ruby s samp script search section select shadow slot small source spacer span strike strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr xmp svg math path'.split(
        ' ',
    ),
)
const residualHtmlEntityPattern = /&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i
const decodeMarkupEntities = (value: string): string => {
    let decoded = value

    for (let pass = 0; pass < MAX_MARKUP_ENTITY_DECODE_PASSES; pass += 1) {
        const next = decoded
            .replace(/&(?:amp|#0*38|#x0*26);/gi, '&')
            .replace(/&(?:lt|#0*60|#x0*3c);/gi, '<')
            .replace(/&(?:gt|#0*62|#x0*3e);/gi, '>')

        if (next === decoded) {
            break
        }

        decoded = next
    }

    return decoded
}
const containsStructuralHtml = (value: string): boolean => {
    const decoded = decodeMarkupEntities(value)

    return (
        residualHtmlEntityPattern.test(decoded) ||
        /<!(?:--|doctype\b)|<\?/i.test(decoded) ||
        [...decoded.matchAll(tagShapedHtmlPattern)].some((match) => {
            const tagName = match[1]!.toLowerCase()
            const markup = match[0]

            return (
                knownHtmlTags.has(tagName) ||
                tagName.includes('-') ||
                markup.startsWith('</') ||
                markup.includes('=') ||
                /\/\s*>$/.test(markup)
            )
        })
    )
}
const isDiscoveryOnlyUrl = (value: string): boolean => {
    const hostname = URL.parse(value)?.hostname.toLowerCase()
    return discoveryOnlyHosts.some(
        (host) => hostname === host || hostname?.endsWith(`.${host}`) === true,
    )
}
const privateHostnameSuffixes = [
    '.example',
    '.home.arpa',
    '.internal',
    '.invalid',
    '.local',
    '.localhost',
    '.test',
]
const isPublicWebUrl = (value: string): boolean => {
    const parsedHostname = URL.parse(value)?.hostname.toLowerCase()

    if (parsedHostname === undefined) {
        return false
    }

    const hostname = parsedHostname.replace(/^\[|\]$/g, '')
    return (
        isIP(hostname) === 0 &&
        hostname.includes('.') &&
        !privateHostnameSuffixes.some(
            (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
        )
    )
}

const addCandidateIssues = (
    candidate: { post: Omit<JobPostInput, 'description'> & { description?: string } },
    context: RefinementCtx,
): void => {
    if (candidate.post.postStatus !== 'active') {
        context.addIssue({
            code: 'custom',
            message: 'Accepted candidates must have an active post status',
            path: ['post', 'postStatus'],
        })
    }

    if (
        candidate.post.description !== undefined &&
        containsStructuralHtml(candidate.post.description)
    ) {
        context.addIssue({
            code: 'custom',
            message: 'Job description must be readable plain text without structural HTML',
            path: ['post', 'description'],
        })
    }

    if (
        candidate.post.description !== undefined &&
        candidate.post.description.split(/\r?\n/).filter((line) => /\S/.test(line)).length < 3
    ) {
        context.addIssue({
            code: 'custom',
            message: 'Job description must preserve source sections and list-item line breaks',
            path: ['post', 'description'],
        })
    }

    employerUrlFields.forEach((field) => {
        if (!isPublicWebUrl(candidate.post[field]) || isDiscoveryOnlyUrl(candidate.post[field])) {
            context.addIssue({
                code: 'custom',
                message: 'Accepted candidates require a public employer or ATS URL',
                path: ['post', field],
            })
        }
    })
}

const acceptedCandidateSchema = z.strictObject(candidateShape).superRefine(addCandidateIssues)

const addUniqueCandidateIssues = (
    candidates: Array<{
        post: Pick<JobPostInput, 'sourceKey' | 'postUrl' | 'applicationUrl'>
    }>,
    context: RefinementCtx,
): void => {
    const identityTokens = new Set<string>()

    candidates.forEach((candidate, index) => {
        const candidateTokens = identityTokensForPost(candidate.post)

        if (candidateTokens.some((token) => identityTokens.has(token))) {
            context.addIssue({
                code: 'custom',
                message: 'Candidate identities must be unique',
                path: [index, 'post', 'sourceKey'],
            })
        }

        candidateTokens.forEach((token) => identityTokens.add(token))
    })
}

const candidateListSchema = z.array(acceptedCandidateSchema)
const candidatePoolSchema = candidateListSchema.superRefine(addUniqueCandidateIssues)
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
const reviewDigestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const reviewPacketSchema = z
    .strictObject({
        reviewDigest: reviewDigestSchema,
        candidates: candidatePoolSchema,
    })
    .superRefine((review, context) => {
        if (review.reviewDigest !== sha256(JSON.stringify(review.candidates))) {
            context.addIssue({
                code: 'custom',
                message: 'Review digest does not match the canonical reviewed candidates',
                path: ['reviewDigest'],
            })
        }
    })

const uniqueStringArray = (itemSchema: z.ZodString, label: string) =>
    z.array(itemSchema).superRefine((values, context) => {
        const seen = new Set<string>()

        values.forEach((value, index) => {
            if (seen.has(value)) {
                context.addIssue({
                    code: 'custom',
                    message: `${label} must be unique`,
                    path: [index],
                })
            }

            seen.add(value)
        })
    })
const historyIdentityArtifactSchema = z.strictObject({
    identityDigests: uniqueStringArray(
        z.string().regex(/^[a-f0-9]{64}$/),
        'History identity digests',
    ),
})
const historyFeedbackTextLimits = {
    title: 500,
    company: 500,
    location: 500,
    compensation: 500,
    techStack: 2_000,
    postSource: 500,
} as const
const historyFeedbackPostSchema = z.strictObject({
    title: z.string().regex(/\S/).max(historyFeedbackTextLimits.title),
    company: z.string().regex(/\S/).max(historyFeedbackTextLimits.company),
    location: z.string().regex(/\S/).max(historyFeedbackTextLimits.location).nullable(),
    compensation: z.string().regex(/\S/).max(historyFeedbackTextLimits.compensation).nullable(),
    techStack: z.string().regex(/\S/).max(historyFeedbackTextLimits.techStack),
    postSource: z.string().regex(/\S/).max(historyFeedbackTextLimits.postSource),
    userLabel: z.enum(USER_LABELS).nullable(),
    applicationStatus: z.enum(APPLICATION_STATUSES),
    appliedAt: z.iso.datetime({ offset: true }).nullable(),
})
const historyFeedbackArtifactSchema = z.strictObject({
    posts: z.array(historyFeedbackPostSchema),
    omittedPosts: z.number().int().nonnegative(),
})

const selectionEntrySchema = z.strictObject({
    sourceKey: jobPostInputSchema.shape.sourceKey,
    agentLabel: standaloneJobRecommendationInputSchema.shape.agentLabel,
    fitRationale: standaloneJobRecommendationInputSchema.shape.fitRationale.max(2_500),
    recommendedResume: z.enum(['frontend', 'backend', 'full-stack']),
    recommendedAction: standaloneJobRecommendationInputSchema.shape.recommendedAction.max(1_500),
})
const selectionArtifactSchema = z.strictObject({
    reviewDigest: reviewDigestSchema,
    selections: z.array(selectionEntrySchema).superRefine((selections, context) => {
        const sourceKeys = new Set<string>()

        selections.forEach((selection, index) => {
            if (sourceKeys.has(selection.sourceKey)) {
                context.addIssue({
                    code: 'custom',
                    message: 'Selected source keys must be unique',
                    path: [index, 'sourceKey'],
                })
            }

            sourceKeys.add(selection.sourceKey)
        })
    }),
})

const selectedJudgmentEntrySchema = z.strictObject({
    sourceKey: selectionEntrySchema.shape.sourceKey,
    verdict: selectionEntrySchema.shape.agentLabel,
    fitRationale: selectionEntrySchema.shape.fitRationale,
    recommendedResume: selectionEntrySchema.shape.recommendedResume,
    recommendedAction: selectionEntrySchema.shape.recommendedAction,
})
const rejectedJudgmentEntrySchema = z.strictObject({
    sourceKey: selectionEntrySchema.shape.sourceKey,
    verdict: z.literal('reject'),
    rejectionReason: z.string().trim().min(1).max(1_500),
})
const judgmentEntrySchema = z.discriminatedUnion('verdict', [
    selectedJudgmentEntrySchema,
    rejectedJudgmentEntrySchema,
])
const judgmentArtifactSchema = z.strictObject({
    reviewDigest: reviewDigestSchema,
    decisions: z.array(judgmentEntrySchema).superRefine((decisions, context) => {
        const sourceKeys = new Set<string>()
        let reachedRejections = false

        decisions.forEach((decision, index) => {
            if (sourceKeys.has(decision.sourceKey)) {
                context.addIssue({
                    code: 'custom',
                    message: 'Judged source keys must be unique',
                    path: [index, 'sourceKey'],
                })
            }

            sourceKeys.add(decision.sourceKey)
            if (decision.verdict === 'reject') {
                reachedRejections = true
            } else if (reachedRejections) {
                context.addIssue({
                    code: 'custom',
                    message: 'Selected decisions must precede rejected decisions',
                    path: [index, 'verdict'],
                })
            }
        })
    }),
})

const coverageTextSchema = z.string().trim().min(1).max(1_000)
const MIN_RELIABLE_COMPLETED_LANES = 3
const MIN_RELIABLE_OPERATIONS_PER_LANE = 7
const JOB_SEARCH_COVERAGE_LANES = [
    'linkedin',
    'indeed',
    'vuejobs',
    'direct-employer-ats',
    'rotating-long-tail',
] as const
const coverageAccessMethodByLane = {
    linkedin: 'installed-chrome-plugin',
    indeed: 'installed-chrome-plugin',
    vuejobs: 'installed-chrome-plugin',
    'direct-employer-ats': 'public-employer-ats',
    'rotating-long-tail': 'public-long-tail',
} as const satisfies Record<(typeof JOB_SEARCH_COVERAGE_LANES)[number], string>
const coverageSourceSchema = z
    .strictObject({
        lane: z.enum(JOB_SEARCH_COVERAGE_LANES),
        operations: z.array(
            z.strictObject({
                query: coverageTextSchema,
                completion: z.enum(['two-pages-reviewed', 'all-results-reviewed']),
            }),
        ),
        accessMethod: z.enum([
            'installed-chrome-plugin',
            'public-employer-ats',
            'public-long-tail',
        ]),
        blocker: coverageTextSchema.nullable(),
    })
    .superRefine((source, context) => {
        if (source.accessMethod !== coverageAccessMethodByLane[source.lane]) {
            context.addIssue({
                code: 'custom',
                message: 'Access method does not match the required coverage lane',
                path: ['accessMethod'],
            })
        }

        if (source.operations.length === 0 && source.blocker === null) {
            context.addIssue({
                code: 'custom',
                message: 'A lane without completed query operations must record its blocker',
                path: ['blocker'],
            })
        }

        const normalizedQueries = new Set(
            source.operations.map(({ query }) => query.toLowerCase().replace(/\s+/g, ' ')),
        )
        if (source.blocker === null && normalizedQueries.size < MIN_RELIABLE_OPERATIONS_PER_LANE) {
            context.addIssue({
                code: 'custom',
                message: `An unblocked lane requires ${MIN_RELIABLE_OPERATIONS_PER_LANE} completed, non-duplicate query variants`,
                path: ['operations'],
            })
        }
    })
const coverageSchema = z.strictObject({
    sources: z
        .array(coverageSourceSchema)
        .length(JOB_SEARCH_COVERAGE_LANES.length)
        .superRefine((sources, context) => {
            const lanes = new Set<string>()

            sources.forEach(({ lane }, index) => {
                if (lanes.has(lane)) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Coverage lanes must be unique',
                        path: [index, 'lane'],
                    })
                }

                lanes.add(lane)
            })
        }),
})

const reliableCoverageSchema = coverageSchema.superRefine((coverage, context) => {
    const completedSources = coverage.sources.filter(
        (source) =>
            source.blocker === null && source.operations.length >= MIN_RELIABLE_OPERATIONS_PER_LANE,
    )

    if (completedSources.length < MIN_RELIABLE_COMPLETED_LANES) {
        context.addIssue({
            code: 'custom',
            message: `Reliable coverage requires at least ${MIN_RELIABLE_COMPLETED_LANES} unblocked lanes with ${MIN_RELIABLE_OPERATIONS_PER_LANE} completed query operations`,
            path: ['sources'],
        })
    }
})

const reportParamsSchema = z.strictObject({
    reportDate: z.iso.date(),
    reportId: z.uuid(),
})

export type StageCandidate = z.infer<typeof acceptedCandidateSchema>
type ReviewPacket = z.infer<typeof reviewPacketSchema>
export type JudgmentArtifact = z.infer<typeof judgmentArtifactSchema>
export type SelectionArtifact = z.infer<typeof selectionArtifactSchema>
export type JobSearchCoverage = z.infer<typeof coverageSchema>
type HistoryIdentityArtifact = z.infer<typeof historyIdentityArtifactSchema>
type HistoryFeedbackArtifact = z.infer<typeof historyFeedbackArtifactSchema>

const assertSerializedByteLimit = <T>(value: T, limit: number, label: string): T => {
    z.string()
        .refine((serialized) => Buffer.byteLength(serialized) <= limit, {
            message: `${label} exceeds the ${limit}-byte limit`,
        })
        .parse(JSON.stringify(value))

    return value
}

const parseSerializedJson = (contents: string, limit: number, label: string): unknown => {
    z.string()
        .refine((serialized) => Buffer.byteLength(serialized) <= limit, {
            message: `${label} exceeds the ${limit}-byte limit`,
        })
        .parse(contents)

    try {
        return JSON.parse(contents) as unknown
    } catch {
        throw new Error(`${label} is not valid JSON`)
    }
}

const compareStrings = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0

const sortedUniqueStrings = (values: Iterable<string>): string[] =>
    [...new Set(values)].sort(compareStrings)

const boundedFeedbackText = (value: string, maximum: number): string =>
    value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`

const boundedNullableFeedbackText = (value: string | null, maximum: number): string | null =>
    value === null ? null : boundedFeedbackText(value, maximum)

const packHistoryFeedback = (
    posts: z.output<typeof historyFeedbackPostSchema>[],
): HistoryFeedbackArtifact => {
    const selected: z.output<typeof historyFeedbackPostSchema>[] = []
    const prefixBytes = Buffer.byteLength('{"posts":[')
    let postBytes = 0

    for (const post of posts) {
        const nextCount = selected.length + 1
        const nextPostBytes = postBytes + Buffer.byteLength(JSON.stringify(post))
        const omittedPosts = posts.length - nextCount
        const serializedBytes =
            prefixBytes +
            nextPostBytes +
            Math.max(0, nextCount - 1) +
            Buffer.byteLength(`],"omittedPosts":${omittedPosts}}`)

        if (serializedBytes > MAX_JOB_SEARCH_HISTORY_FEEDBACK_BYTES) {
            break
        }

        selected.push(post)
        postBytes = nextPostBytes
    }

    return validateHistoryFeedbackArtifact({
        posts: selected,
        omittedPosts: posts.length - selected.length,
    })
}

const validateHistoryIdentityArtifact = (value: unknown): HistoryIdentityArtifact =>
    assertSerializedByteLimit(
        historyIdentityArtifactSchema.parse(value),
        MAX_JOB_SEARCH_HISTORY_IDENTITY_BYTES,
        'History identity artifact',
    )

export const validateSerializedHistoryIdentityArtifact = (
    contents: string,
): HistoryIdentityArtifact =>
    historyIdentityArtifactSchema.parse(
        parseSerializedJson(
            contents,
            MAX_JOB_SEARCH_HISTORY_IDENTITY_BYTES,
            'History identity artifact',
        ),
    )

const validateHistoryFeedbackArtifact = (value: unknown): HistoryFeedbackArtifact =>
    assertSerializedByteLimit(
        historyFeedbackArtifactSchema.parse(value),
        MAX_JOB_SEARCH_HISTORY_FEEDBACK_BYTES,
        'History feedback artifact',
    )

export const createHistoryArtifacts = (
    jobPostsResponseValue: unknown,
): {
    postCount: number
    identities: HistoryIdentityArtifact
    feedback: HistoryFeedbackArtifact
} => {
    const posts = parseJobPosts(jobPostsResponseValue)
    const feedbackPosts = posts
        .filter((post) => post.userLabel !== null || post.applicationStatus !== 'not-applied')
        .sort(
            (left, right) =>
                compareStrings(right.updatedAt, left.updatedAt) ||
                compareStrings(right.id, left.id),
        )
        .map((post) =>
            historyFeedbackPostSchema.parse({
                title: boundedFeedbackText(post.roleTitle, historyFeedbackTextLimits.title),
                company: boundedFeedbackText(post.company, historyFeedbackTextLimits.company),
                location: boundedNullableFeedbackText(
                    post.location,
                    historyFeedbackTextLimits.location,
                ),
                compensation: boundedNullableFeedbackText(
                    post.compensation,
                    historyFeedbackTextLimits.compensation,
                ),
                techStack: boundedFeedbackText(post.techStack, historyFeedbackTextLimits.techStack),
                postSource: boundedFeedbackText(
                    post.postSource,
                    historyFeedbackTextLimits.postSource,
                ),
                userLabel: post.userLabel,
                applicationStatus: post.applicationStatus,
                appliedAt: post.appliedAt,
            }),
        )

    const identities = validateHistoryIdentityArtifact({
        identityDigests: sortedUniqueStrings(
            posts.flatMap(identityTokensForPost).map((identity) => sha256(identity)),
        ),
    })
    const feedback = packHistoryFeedback(feedbackPosts)

    return { postCount: posts.length, identities, feedback }
}

const assertKnownSelections = <T extends { post: { sourceKey: string } }>(
    candidates: T[],
    selection: SelectionArtifact,
): SelectionArtifact => {
    const candidateSourceKeys = new Set(candidates.map((candidate) => candidate.post.sourceKey))

    z.unknown()
        .superRefine((_value, context) => {
            selection.selections.forEach(({ sourceKey }, index) => {
                if (!candidateSourceKeys.has(sourceKey)) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Selected source key does not exist in the candidate pool',
                        path: ['selections', index, 'sourceKey'],
                    })
                }
            })
        })
        .parse(selection)

    return selection
}

const assertMatchingReviewDigest = <T extends { reviewDigest: string }>(
    review: ReviewPacket,
    artifact: T,
): T => {
    z.unknown()
        .superRefine((_value, context) => {
            if (artifact.reviewDigest !== review.reviewDigest) {
                context.addIssue({
                    code: 'custom',
                    message: 'Artifact digest does not match the reviewed candidate artifact',
                    path: ['reviewDigest'],
                })
            }
        })
        .parse(artifact)

    return artifact
}

const validateJudgmentArtifact = (value: unknown): JudgmentArtifact =>
    assertSerializedByteLimit(
        judgmentArtifactSchema.parse(value),
        MAX_JOB_SEARCH_JUDGMENT_BYTES,
        'Judgment artifact',
    )

export const validateSerializedJudgmentArtifact = (contents: string): JudgmentArtifact =>
    judgmentArtifactSchema.parse(
        parseSerializedJson(contents, MAX_JOB_SEARCH_JUDGMENT_BYTES, 'Judgment artifact'),
    )

const validateSelectionArtifact = (value: unknown): SelectionArtifact =>
    assertSerializedByteLimit(
        selectionArtifactSchema.parse(value),
        MAX_JOB_SEARCH_SELECTION_BYTES,
        'Selection artifact',
    )

export const validateSerializedSelectionArtifact = (contents: string): SelectionArtifact =>
    selectionArtifactSchema.parse(
        parseSerializedJson(contents, MAX_JOB_SEARCH_SELECTION_BYTES, 'Selection artifact'),
    )

export const validateAcceptedCandidate = (value: unknown): StageCandidate =>
    assertSerializedByteLimit(
        acceptedCandidateSchema.parse(value),
        MAX_JOB_SEARCH_CANDIDATE_BYTES,
        'Candidate artifact',
    )

export const validateSerializedCandidate = (contents: string): StageCandidate =>
    acceptedCandidateSchema.parse(
        parseSerializedJson(contents, MAX_JOB_SEARCH_CANDIDATE_BYTES, 'Candidate artifact'),
    )

export const validateCandidatePool = (value: unknown): StageCandidate[] =>
    assertSerializedByteLimit(
        candidatePoolSchema.parse(value),
        MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES,
        'Candidate pool',
    )

export const validateSerializedCandidatePool = (contents: string): StageCandidate[] =>
    candidatePoolSchema.parse(
        parseSerializedJson(contents, MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES, 'Candidate pool'),
    )

export const validateSerializedCandidateList = (contents: string): StageCandidate[] =>
    candidateListSchema.parse(
        parseSerializedJson(contents, MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES, 'Merged candidate list'),
    )

const validateReviewPacket = (value: unknown): ReviewPacket =>
    assertSerializedByteLimit(
        reviewPacketSchema.parse(value),
        MAX_JOB_SEARCH_REVIEW_BYTES,
        'Review artifact',
    )

export const validateSerializedReviewPacket = (contents: string): ReviewPacket =>
    reviewPacketSchema.parse(
        parseSerializedJson(contents, MAX_JOB_SEARCH_REVIEW_BYTES, 'Review artifact'),
    )

export const createReviewPacket = (
    candidateValue: unknown,
    historyIdentityValue: unknown,
): ReviewPacket => {
    const candidates = validateCandidatePool(candidateValue)
    const historyIdentities = validateHistoryIdentityArtifact(historyIdentityValue)
    const existingIdentityDigests = new Set(historyIdentities.identityDigests)

    z.unknown()
        .superRefine((_value, context) => {
            candidates.forEach((candidate, index) => {
                if (
                    identityTokensForPost(candidate.post).some((token) =>
                        existingIdentityDigests.has(sha256(token)),
                    )
                ) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Candidate identity already exists',
                        path: [index, 'post', 'sourceKey'],
                    })
                }
            })
        })
        .parse(candidates)

    return validateReviewPacket({
        reviewDigest: sha256(JSON.stringify(candidates)),
        candidates,
    })
}

export const createDeduplicatedReviewPacket = (
    candidateValue: unknown,
    historyIdentityValue: unknown,
): {
    candidates: StageCandidate[]
    review: ReviewPacket
    existingExcluded: number
    duplicateExcluded: number
} => {
    const candidates = assertSerializedByteLimit(
        candidateListSchema.parse(candidateValue),
        MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES,
        'Merged candidate list',
    )
    const historyIdentities = validateHistoryIdentityArtifact(historyIdentityValue)
    const existingIdentityDigests = new Set(historyIdentities.identityDigests)
    const currentIdentityTokens = new Set<string>()
    const deduplicatedCandidates: StageCandidate[] = []
    let existingExcluded = 0
    let duplicateExcluded = 0

    candidates.forEach((candidate) => {
        const tokens = identityTokensForPost(candidate.post)

        if (tokens.some((token) => existingIdentityDigests.has(sha256(token)))) {
            existingExcluded += 1
            return
        }
        if (tokens.some((token) => currentIdentityTokens.has(token))) {
            duplicateExcluded += 1
            return
        }

        deduplicatedCandidates.push(candidate)
        tokens.forEach((token) => currentIdentityTokens.add(token))
    })

    return {
        candidates: validateCandidatePool(deduplicatedCandidates),
        review: createReviewPacket(deduplicatedCandidates, { identityDigests: [] }),
        existingExcluded,
        duplicateExcluded,
    }
}

export const validateSelection = (
    reviewValue: unknown,
    selectionValue: unknown,
): SelectionArtifact => {
    const reviewPacket = validateReviewPacket(reviewValue)
    const selection = assertMatchingReviewDigest(
        reviewPacket,
        validateSelectionArtifact(selectionValue),
    )
    return assertKnownSelections(reviewPacket.candidates, selection)
}

export const createSelectionFromJudgment = (
    reviewValue: unknown,
    judgmentValue: unknown,
): SelectionArtifact => {
    const reviewPacket = validateReviewPacket(reviewValue)
    const judgment = assertMatchingReviewDigest(
        reviewPacket,
        validateJudgmentArtifact(judgmentValue),
    )
    const candidateSourceKeys = new Set(
        reviewPacket.candidates.map((candidate) => candidate.post.sourceKey),
    )

    z.unknown()
        .superRefine((_value, context) => {
            judgment.decisions.forEach(({ sourceKey }, index) => {
                if (!candidateSourceKeys.has(sourceKey)) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Judged source key does not exist in the candidate packet',
                        path: ['decisions', index, 'sourceKey'],
                    })
                }
            })

            if (judgment.decisions.length !== reviewPacket.candidates.length) {
                context.addIssue({
                    code: 'custom',
                    message: 'Judgment must account for every reviewed candidate exactly once',
                    path: ['decisions'],
                })
            }
        })
        .parse(judgment)

    return validateSelection(reviewPacket, {
        reviewDigest: judgment.reviewDigest,
        selections: judgment.decisions.flatMap((decision) =>
            decision.verdict === 'reject'
                ? []
                : [
                      {
                          sourceKey: decision.sourceKey,
                          agentLabel: decision.verdict,
                          fitRationale: decision.fitRationale,
                          recommendedResume: decision.recommendedResume,
                          recommendedAction: decision.recommendedAction,
                      },
                  ],
        ),
    })
}

export const validateCoverage = (value: unknown, requireReliable = false): JobSearchCoverage =>
    (requireReliable ? reliableCoverageSchema : coverageSchema).parse(value)

export const validateSerializedCoverage = (
    contents: string,
    requireReliable = false,
): JobSearchCoverage =>
    validateCoverage(
        parseSerializedJson(contents, MAX_JOB_SEARCH_COVERAGE_BYTES, 'Coverage artifact'),
        requireReliable,
    )

export const validateCoverageHandoff = (
    coverageValue: unknown,
    candidateValue: unknown,
): { candidates: StageCandidate[]; coverage: JobSearchCoverage } => {
    const candidates = validateCandidatePool(candidateValue)
    const coverage = validateCoverage(coverageValue, true)

    return { candidates, coverage }
}

export const assembleFinalReport = (
    candidateValue: unknown,
    selectionValue: unknown,
    coverageValue: unknown,
): UpsertJobSearchReportInput => {
    const { candidates, coverage } = validateCoverageHandoff(coverageValue, candidateValue)
    const reviewPacket = createReviewPacket(candidates, { identityDigests: [] })
    const selection = assertKnownSelections(
        candidates,
        assertMatchingReviewDigest(reviewPacket, validateSelectionArtifact(selectionValue)),
    )
    const selectedCount = selection.selections.length
    const judgmentExcludedCount = candidates.length - selectedCount
    const completedOperationCount = coverage.sources.reduce(
        (total, source) => total + source.operations.length,
        0,
    )
    const completedLaneCount = coverage.sources.filter(
        (source) => source.blocker === null && source.operations.length >= 2,
    ).length
    const blockedLaneCount = coverage.sources.filter(({ blocker }) => blocker !== null).length
    const summary = `${selectedCount} qualified ${selectedCount === 1 ? 'match' : 'matches'}; ${candidates.length} handed to judgment, ${judgmentExcludedCount} excluded by judgment; ${completedOperationCount} query operations completed across ${completedLaneCount} lanes; ${blockedLaneCount} blocked source ${blockedLaneCount === 1 ? 'lane' : 'lanes'}.`
    const candidateBySourceKey = new Map(
        candidates.map((candidate) => [candidate.post.sourceKey, candidate]),
    )
    const report = upsertJobSearchReportInputSchema.parse({
        summary,
        results: selection.selections.map((selected, index) => {
            const candidate = candidateBySourceKey.get(selected.sourceKey)!

            return {
                agentRank: index + 1,
                agentLabel: selected.agentLabel,
                fitRationale: selected.fitRationale,
                applicationFlow: candidate.applicationFlow,
                keyLegitimacySignals: candidate.keyLegitimacySignals,
                recommendedResume: selected.recommendedResume,
                recommendedAction: selected.recommendedAction,
                legitimacyNotes: candidate.legitimacyNotes,
                post: candidate.post,
            }
        }),
    })

    return assertSerializedByteLimit(report, MAX_JSON_REQUEST_BYTES, 'Final report')
}

export const validateSerializedReport = (contents: string): UpsertJobSearchReportInput =>
    upsertJobSearchReportInputSchema.parse(
        parseSerializedJson(contents, MAX_JSON_REQUEST_BYTES, 'Final report'),
    )

const responseVisiblePostFields = [
    'sourceKey',
    'roleTitle',
    'company',
    'location',
    'compensation',
    'techStack',
    'postSource',
    'postUrl',
    'applicationUrl',
    'postStatus',
] as const satisfies readonly (keyof JobPostInput)[]

const responsePostFields = [
    'id',
    ...responseVisiblePostFields,
    'applicationStatus',
    'appliedAt',
    'userLabel',
    'archivedAt',
    'createdAt',
    'updatedAt',
] as const

const responseVisibleRecommendationFields = [
    'agentRank',
    'agentLabel',
    'fitRationale',
    'applicationFlow',
    'keyLegitimacySignals',
    'recommendedResume',
    'recommendedAction',
    'legitimacyNotes',
] as const

const responseResultFields = [
    ...responseVisibleRecommendationFields,
    'post',
    'jobPostSnapshot',
] as const
const responseSnapshotFields = ['description', 'sourceUrl', 'capturedAt'] as const
const responseReportFields = [
    'id',
    'reportDate',
    'summary',
    'createdAt',
    'updatedAt',
    'archivedAt',
    'results',
] as const

const responseMatchesPayloadSchema = (
    reportDate: string,
    reportId: string,
    payload: UpsertJobSearchReportInput,
) =>
    z.unknown().superRefine((value, context) => {
        const response = value as JobSearchReport
        const rejectUnexpectedFields = (
            record: Record<string, unknown>,
            fields: readonly string[],
            path: PropertyKey[],
        ): void => {
            const allowedFields = new Set(fields)

            if (Object.keys(record).some((field) => !allowedFields.has(field))) {
                context.addIssue({
                    code: 'custom',
                    message: 'API response contains an unexpected field',
                    path,
                })
            }
        }

        const compare = (actual: unknown, expected: unknown, path: PropertyKey[]) => {
            if (!Object.is(actual, expected)) {
                context.addIssue({
                    code: 'custom',
                    message: 'API response field does not match the submitted payload',
                    path,
                })
            }
        }

        compare(response.id, reportId, ['id'])
        compare(response.reportDate, reportDate, ['reportDate'])
        compare(response.summary, payload.summary, ['summary'])
        compare(response.results.length, payload.results.length, ['results'])
        rejectUnexpectedFields(
            response as unknown as Record<string, unknown>,
            responseReportFields,
            [],
        )

        payload.results.forEach((expectedResult, index) => {
            const actualResult = response.results[index]

            if (actualResult === undefined) {
                return
            }

            rejectUnexpectedFields(
                actualResult as unknown as Record<string, unknown>,
                responseResultFields,
                ['results', index],
            )
            rejectUnexpectedFields(
                actualResult.post as unknown as Record<string, unknown>,
                responsePostFields,
                ['results', index, 'post'],
            )
            if (actualResult.jobPostSnapshot !== null) {
                rejectUnexpectedFields(
                    actualResult.jobPostSnapshot as unknown as Record<string, unknown>,
                    responseSnapshotFields,
                    ['results', index, 'jobPostSnapshot'],
                )
            }

            responseVisibleRecommendationFields.forEach((field) => {
                compare(actualResult[field], expectedResult[field], ['results', index, field])
            })
            responseVisiblePostFields.forEach((field) => {
                compare(actualResult.post[field], expectedResult.post[field], [
                    'results',
                    index,
                    'post',
                    field,
                ])
            })
            compare(actualResult.jobPostSnapshot?.description, expectedResult.post.description, [
                'results',
                index,
                'jobPostSnapshot',
                'description',
            ])
            compare(actualResult.jobPostSnapshot?.sourceUrl, expectedResult.post.postUrl, [
                'results',
                index,
                'jobPostSnapshot',
                'sourceUrl',
            ])
        })
    })

export const verifyApiResponse = (
    reportDate: string,
    reportId: string,
    payloadValue: unknown,
    responseValue: unknown,
): JobSearchReport => {
    const params = reportParamsSchema.parse({ reportDate, reportId })
    const payload = upsertJobSearchReportInputSchema.parse(payloadValue)
    const response = parseJobSearchReport(responseValue)

    responseMatchesPayloadSchema(params.reportDate, params.reportId, payload).parse(response)
    return response
}

const markdownSyntaxPattern = /([!"#$%'()*+,\-./:=?@[\\\]^_`{|}~])/g
const escapeMarkdownText = (value: string | number | null): string => {
    const text = value === null ? 'Not provided' : String(value)

    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replace(markdownSyntaxPattern, '\\$1')
        .replace(/\r\n|\r|\n/g, '<br>')
}

const escapeMarkdownUrl = (value: string): string => {
    const destination = value
        .replaceAll('\\', '%5C')
        .replaceAll('(', '%28')
        .replaceAll(')', '%29')
        .replaceAll('[', '%5B')
        .replaceAll(']', '%5D')
        .replaceAll('{', '%7B')
        .replaceAll('}', '%7D')
        .replaceAll('<', '%3C')
        .replaceAll('>', '%3E')
        .replaceAll('"', '%22')
        .replaceAll("'", '%27')
        .replaceAll('`', '%60')
        .replaceAll('|', '%7C')
        .replaceAll('&', '\\&')

    return `[${escapeMarkdownText(value)}](${destination})`
}

export const renderJobSearchMarkdown = (
    reportDate: string,
    reportId: string,
    payloadValue: unknown,
    coverageValue: unknown,
): string => {
    const params = reportParamsSchema.parse({ reportDate, reportId })
    const payload = assertSerializedByteLimit(
        upsertJobSearchReportInputSchema.parse(payloadValue),
        MAX_JSON_REQUEST_BYTES,
        'Final report',
    )
    const coverage = validateCoverage(coverageValue, true)
    const lines = [
        `# Job Search Report — ${params.reportDate}`,
        '',
        `Report ID: ${params.reportId}`,
        '',
        '## Summary',
        '',
        escapeMarkdownText(payload.summary),
        '',
        `- Qualified: ${payload.results.length}`,
        '',
        '## Coverage',
        '',
        '| Source | Completed queries / filters | Completion | Access method | Blocker |',
        '| --- | --- | --- | --- | --- |',
        ...coverage.sources.map(
            (source) =>
                `| ${escapeMarkdownText(source.lane)} | ${source.operations.map(({ query }) => escapeMarkdownText(query)).join('<br>')} | ${source.operations.map(({ completion }) => escapeMarkdownText(completion)).join('<br>')} | ${escapeMarkdownText(source.accessMethod)} | ${escapeMarkdownText(source.blocker)} |`,
        ),
        '',
        '## Ranked Targets',
        '',
        '| Rank | Verdict | Role | Company | Location | Compensation | Technology stack | Source | Post URL | Application URL | Fit rationale | Legitimacy evidence | Resume | Application flow / unknowns | Legitimacy concerns | Recommended action |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...payload.results.map(
            (result) =>
                `| ${result.agentRank} | ${escapeMarkdownText(result.agentLabel)} | ${escapeMarkdownText(result.post.roleTitle)} | ${escapeMarkdownText(result.post.company)} | ${escapeMarkdownText(result.post.location)} | ${escapeMarkdownText(result.post.compensation)} | ${escapeMarkdownText(result.post.techStack)} | ${escapeMarkdownText(result.post.postSource)} | ${escapeMarkdownUrl(result.post.postUrl)} | ${escapeMarkdownUrl(result.post.applicationUrl)} | ${escapeMarkdownText(result.fitRationale)} | ${escapeMarkdownText(result.keyLegitimacySignals)} | ${escapeMarkdownText(result.recommendedResume)} | ${escapeMarkdownText(result.applicationFlow)} | ${escapeMarkdownText(result.legitimacyNotes)} | ${escapeMarkdownText(result.recommendedAction)} |`,
        ),
        '',
    ]

    return lines.join('\n')
}

export const verifyRenderedMarkdown = (
    reportDate: string,
    reportId: string,
    payloadValue: unknown,
    coverageValue: unknown,
    markdown: string,
): string => {
    const expected = renderJobSearchMarkdown(reportDate, reportId, payloadValue, coverageValue)

    z.strictObject({
        markdown: z.string().refine((value) => Buffer.from(value).equals(Buffer.from(expected)), {
            message: 'Markdown does not match the deterministic report rendering',
        }),
    }).parse({ markdown })

    return markdown
}

const storedDescriptionResultSchema = z.array(
    z.strictObject({
        agentRank: z.number().int().positive(),
        sourceKey: jobPostInputSchema.shape.sourceKey,
        sourceUrl: jobPostInputSchema.shape.postUrl.nullable(),
        description: jobPostInputSchema.shape.description.nullable(),
    }),
)

export type StoredDescriptionResult = z.infer<typeof storedDescriptionResultSchema>[number]

export const verifyStoredDescriptions = (
    payloadValue: unknown,
    storedValue: unknown,
): StoredDescriptionResult[] => {
    const payload = upsertJobSearchReportInputSchema.parse(payloadValue)
    const storedResults = storedDescriptionResultSchema.parse(storedValue)

    z.unknown()
        .superRefine((_value, context) => {
            const compare = (actual: unknown, expected: unknown, path: PropertyKey[]) => {
                if (!Object.is(actual, expected)) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Stored description field does not match the submitted payload',
                        path,
                    })
                }
            }

            compare(storedResults.length, payload.results.length, ['results'])
            payload.results.forEach((result, index) => {
                const stored = storedResults[index]

                if (stored === undefined) {
                    return
                }

                compare(stored.agentRank, result.agentRank, ['results', index, 'agentRank'])
                compare(stored.sourceKey, result.post.sourceKey, [
                    'results',
                    index,
                    'post',
                    'sourceKey',
                ])
                compare(stored.sourceUrl, result.post.postUrl, [
                    'results',
                    index,
                    'post',
                    'sourceUrl',
                ])
                compare(stored.description, result.post.description, [
                    'results',
                    index,
                    'post',
                    'description',
                ])
            })
        })
        .parse(storedResults)

    return storedResults
}

export const verifyStoredReportDescriptions = async (
    reportIdValue: string,
    payloadValue: unknown,
): Promise<StoredDescriptionResult[]> => {
    const reportId = z
        .strictObject({ reportId: z.uuid() })
        .parse({ reportId: reportIdValue }).reportId
    const { prisma } = await import('./db/prisma.ts')

    try {
        const report = await prisma.jobSearchReport.findUnique({
            where: { id: reportId },
            select: {
                results: {
                    orderBy: { agentRank: 'asc' },
                    select: {
                        agentRank: true,
                        post: {
                            select: {
                                sourceKey: true,
                                snapshot: { select: { sourceUrl: true, description: true } },
                            },
                        },
                    },
                },
            },
        })

        z.unknown()
            .superRefine((_value, context) => {
                if (report === null) {
                    context.addIssue({
                        code: 'custom',
                        message: 'Stored job search report was not found',
                        path: ['reportId'],
                    })
                }
            })
            .parse(report)

        return verifyStoredDescriptions(
            payloadValue,
            report!.results.map(({ agentRank, post }) => ({
                agentRank,
                sourceKey: post.sourceKey,
                sourceUrl: post.snapshot?.sourceUrl ?? null,
                description: post.snapshot?.description ?? null,
            })),
        )
    } finally {
        await prisma.$disconnect()
    }
}
