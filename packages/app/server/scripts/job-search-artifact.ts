import { constants as fsConstants } from 'node:fs'
import { open, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TextDecoder } from 'node:util'
import { pathToFileURL } from 'node:url'
import { MAX_JSON_REQUEST_BYTES } from '@job-search-facilitator/core'
import { z } from 'zod'
import {
    assembleFinalReport,
    createDeduplicatedReviewPacket,
    createHistoryArtifacts,
    createReviewPacket,
    createSelectionFromJudgment,
    MAX_JOB_SEARCH_CANDIDATE_BYTES,
    MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES,
    MAX_JOB_SEARCH_COVERAGE_BYTES,
    MAX_JOB_SEARCH_HISTORY_IDENTITY_BYTES,
    MAX_JOB_SEARCH_HISTORY_RESPONSE_BYTES,
    MAX_JOB_SEARCH_JUDGMENT_BYTES,
    MAX_JOB_SEARCH_REVIEW_BYTES,
    MAX_JOB_SEARCH_SELECTION_BYTES,
    renderJobSearchMarkdown,
    validateCoverageHandoff,
    validateSelection,
    validateSerializedCandidate,
    validateSerializedCandidateList,
    validateSerializedCandidatePool,
    validateSerializedCoverage,
    validateSerializedHistoryIdentityArtifact,
    validateSerializedJudgmentArtifact,
    validateSerializedReport,
    validateSerializedReviewPacket,
    validateSerializedSelectionArtifact,
    verifyApiResponse,
    verifyRenderedMarkdown,
    verifyStoredReportDescriptions,
} from '../src/job-search-artifact.ts'

const MAX_MARKDOWN_REPORT_BYTES = MAX_JSON_REQUEST_BYTES * 4
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
type BoundedReader = {
    read(
        buffer: Buffer,
        offset: number,
        length: number,
        position: number,
    ): Promise<{ bytesRead: number }>
}

export const readIntoBuffer = async (reader: BoundedReader, buffer: Buffer): Promise<number> => {
    let totalBytesRead = 0

    while (totalBytesRead < buffer.length) {
        const { bytesRead } = await reader.read(
            buffer,
            totalBytesRead,
            buffer.length - totalBytesRead,
            totalBytesRead,
        )
        if (bytesRead === 0) {
            break
        }
        totalBytesRead += bytesRead
    }

    return totalBytesRead
}

const readBoundedFile = async (path: string, limit: number, label: string): Promise<string> => {
    const file = await open(
        path,
        fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | fsConstants.O_NOFOLLOW,
    )

    try {
        const statistics = await file.stat()
        if (!statistics.isFile()) {
            throw new Error(`${label} must be a regular file`)
        }
        if (statistics.size > limit) {
            throw new Error(`${label} exceeds the ${limit}-byte limit`)
        }

        const buffer = Buffer.allocUnsafe(limit + 1)
        const bytesRead = await readIntoBuffer(file, buffer)
        if (bytesRead > limit) {
            throw new Error(`${label} exceeds the ${limit}-byte limit`)
        }

        try {
            return utf8Decoder.decode(buffer.subarray(0, bytesRead))
        } catch {
            throw new Error(`${label} is not valid UTF-8`)
        }
    } finally {
        await file.close()
    }
}
const readJson = async (
    path: string,
    limit = MAX_JSON_REQUEST_BYTES,
    label = 'JSON artifact',
): Promise<unknown> => {
    const contents = await readBoundedFile(path, limit, label)

    try {
        return JSON.parse(contents) as unknown
    } catch {
        throw new Error(`${label} is not valid JSON`)
    }
}

const writeJson = async (path: string, value: unknown): Promise<void> => {
    await writeFile(path, JSON.stringify(value))
}

const printJson = (value: unknown): void => {
    process.stdout.write(`${JSON.stringify(value)}\n`)
}

const requireArguments = (command: string, values: string[], count: number): void => {
    if (values.length !== count) {
        throw new Error(`${command} expected ${count} argument${count === 1 ? '' : 's'}`)
    }
}

export const runCli = async ([command, ...args]: string[]): Promise<void> => {
    if (command === '--') {
        return runCli(args)
    }

    switch (command) {
        case 'candidate': {
            requireArguments(command, args, 1)
            const candidate = validateSerializedCandidate(
                await readBoundedFile(
                    args[0]!,
                    MAX_JOB_SEARCH_CANDIDATE_BYTES,
                    'Candidate artifact',
                ),
            )
            printJson({
                validated: true,
                sourceKey: candidate.post.sourceKey,
                serializedBytes: Buffer.byteLength(JSON.stringify(candidate)),
            })
            return
        }
        case 'coverage': {
            requireArguments(command, args, 2)
            const { candidates, coverage } = validateCoverageHandoff(
                validateSerializedCoverage(
                    await readBoundedFile(
                        args[0]!,
                        MAX_JOB_SEARCH_COVERAGE_BYTES,
                        'Coverage artifact',
                    ),
                    true,
                ),
                validateSerializedCandidatePool(
                    await readBoundedFile(
                        args[1]!,
                        MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES,
                        'Candidate pool',
                    ),
                ),
            )
            printJson({
                validated: true,
                candidates: candidates.length,
                completedLanes: coverage.sources
                    .filter(({ blocker }) => blocker === null)
                    .map(({ lane }) => lane),
                blockedLanes: coverage.sources
                    .filter(({ blocker }) => blocker !== null)
                    .map(({ lane }) => lane),
            })
            return
        }
        case 'history': {
            requireArguments(command, args, 3)
            const { postCount, identities, feedback } = createHistoryArtifacts(
                await readJson(
                    args[0]!,
                    MAX_JOB_SEARCH_HISTORY_RESPONSE_BYTES,
                    'Job history response',
                ),
            )

            await Promise.all([writeJson(args[1]!, identities), writeJson(args[2]!, feedback)])
            printJson({
                validated: true,
                posts: postCount,
                identities: identities.identityDigests.length,
                feedbackPosts: feedback.posts.length,
                feedbackOmittedPosts: feedback.omittedPosts,
                identitiesBytes: Buffer.byteLength(JSON.stringify(identities)),
                feedbackBytes: Buffer.byteLength(JSON.stringify(feedback)),
            })
            return
        }
        case 'pool': {
            if (args.length === 4) {
                const [mergedPath, identitiesPath, candidatesPath, reviewPath] = args as [
                    string,
                    string,
                    string,
                    string,
                ]
                const result = createDeduplicatedReviewPacket(
                    validateSerializedCandidateList(
                        await readBoundedFile(
                            mergedPath,
                            MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES,
                            'Merged candidate list',
                        ),
                    ),
                    validateSerializedHistoryIdentityArtifact(
                        await readBoundedFile(
                            identitiesPath,
                            MAX_JOB_SEARCH_HISTORY_IDENTITY_BYTES,
                            'History identity artifact',
                        ),
                    ),
                )

                await Promise.all([
                    writeJson(candidatesPath, result.candidates),
                    writeJson(reviewPath, result.review),
                ])
                printJson({
                    validated: true,
                    candidates: result.candidates.length,
                    existingExcluded: result.existingExcluded,
                    duplicateExcluded: result.duplicateExcluded,
                })
                return
            }

            requireArguments(command, args, 3)
            const review = createReviewPacket(
                validateSerializedCandidatePool(
                    await readBoundedFile(
                        args[0]!,
                        MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES,
                        'Candidate pool',
                    ),
                ),
                validateSerializedHistoryIdentityArtifact(
                    await readBoundedFile(
                        args[1]!,
                        MAX_JOB_SEARCH_HISTORY_IDENTITY_BYTES,
                        'History identity artifact',
                    ),
                ),
            )
            await writeJson(args[2]!, review)
            printJson({ validated: true, candidates: review.candidates.length })
            return
        }
        case 'selection':
            requireArguments(command, args, 2)
            printJson(
                validateSelection(
                    validateSerializedReviewPacket(
                        await readBoundedFile(
                            args[0]!,
                            MAX_JOB_SEARCH_REVIEW_BYTES,
                            'Review artifact',
                        ),
                    ),
                    validateSerializedSelectionArtifact(
                        await readBoundedFile(
                            args[1]!,
                            MAX_JOB_SEARCH_SELECTION_BYTES,
                            'Selection artifact',
                        ),
                    ),
                ),
            )
            return
        case 'judgment': {
            requireArguments(command, args, 3)
            const [reviewPath, judgmentPath, selectionPath] = args as [string, string, string]
            const judgment = validateSerializedJudgmentArtifact(
                await readBoundedFile(
                    judgmentPath,
                    MAX_JOB_SEARCH_JUDGMENT_BYTES,
                    'Judgment artifact',
                ),
            )
            const selection = createSelectionFromJudgment(
                validateSerializedReviewPacket(
                    await readBoundedFile(
                        reviewPath,
                        MAX_JOB_SEARCH_REVIEW_BYTES,
                        'Review artifact',
                    ),
                ),
                judgment,
            )

            await writeJson(selectionPath, selection)
            printJson({
                validated: true,
                reviewed: judgment.decisions.length,
                targets: selection.selections.filter(({ agentLabel }) => agentLabel === 'target')
                    .length,
                quickApps: selection.selections.filter(
                    ({ agentLabel }) => agentLabel === 'quick-app',
                ).length,
                rejected: judgment.decisions.length - selection.selections.length,
            })
            return
        }
        case 'assemble': {
            requireArguments(command, args, 4)
            const [candidatesPath, selectionPath, coveragePath, outputPath] = args as [
                string,
                string,
                string,
                string,
            ]
            await writeJson(
                outputPath,
                assembleFinalReport(
                    validateSerializedCandidatePool(
                        await readBoundedFile(
                            candidatesPath,
                            MAX_JOB_SEARCH_CANDIDATE_POOL_BYTES,
                            'Candidate pool',
                        ),
                    ),
                    validateSerializedSelectionArtifact(
                        await readBoundedFile(
                            selectionPath,
                            MAX_JOB_SEARCH_SELECTION_BYTES,
                            'Selection artifact',
                        ),
                    ),
                    validateSerializedCoverage(
                        await readBoundedFile(
                            coveragePath,
                            MAX_JOB_SEARCH_COVERAGE_BYTES,
                            'Coverage artifact',
                        ),
                    ),
                ),
            )
            return
        }
        case 'report':
            requireArguments(command, args, 1)
            printJson(
                validateSerializedReport(
                    await readBoundedFile(args[0]!, MAX_JSON_REQUEST_BYTES, 'Final report'),
                ),
            )
            return
        case 'render': {
            requireArguments(command, args, 5)
            const [reportDate, reportId, payloadPath, coveragePath, outputPath] = args as [
                string,
                string,
                string,
                string,
                string,
            ]
            await writeFile(
                outputPath,
                renderJobSearchMarkdown(
                    reportDate,
                    reportId,
                    validateSerializedReport(
                        await readBoundedFile(payloadPath, MAX_JSON_REQUEST_BYTES, 'Final report'),
                    ),
                    validateSerializedCoverage(
                        await readBoundedFile(
                            coveragePath,
                            MAX_JOB_SEARCH_COVERAGE_BYTES,
                            'Coverage artifact',
                        ),
                    ),
                ),
            )
            return
        }
        case 'verify': {
            requireArguments(command, args, 4)
            const [reportDate, reportId, payloadPath, responsePath] = args as [
                string,
                string,
                string,
                string,
            ]
            verifyApiResponse(
                reportDate,
                reportId,
                validateSerializedReport(
                    await readBoundedFile(payloadPath, MAX_JSON_REQUEST_BYTES, 'Final report'),
                ),
                await readJson(responsePath, MAX_JSON_REQUEST_BYTES, 'API response'),
            )
            process.stdout.write('verified\n')
            return
        }
        case 'verify-storage':
            requireArguments(command, args, 2)
            await verifyStoredReportDescriptions(
                args[0]!,
                validateSerializedReport(
                    await readBoundedFile(args[1]!, MAX_JSON_REQUEST_BYTES, 'Final report'),
                ),
            )
            process.stdout.write('verified\n')
            return
        case 'verify-markdown': {
            requireArguments(command, args, 5)
            const [reportDate, reportId, payloadPath, coveragePath, markdownPath] = args as [
                string,
                string,
                string,
                string,
                string,
            ]
            verifyRenderedMarkdown(
                reportDate,
                reportId,
                validateSerializedReport(
                    await readBoundedFile(payloadPath, MAX_JSON_REQUEST_BYTES, 'Final report'),
                ),
                validateSerializedCoverage(
                    await readBoundedFile(
                        coveragePath,
                        MAX_JOB_SEARCH_COVERAGE_BYTES,
                        'Coverage artifact',
                    ),
                ),
                await readBoundedFile(markdownPath, MAX_MARKDOWN_REPORT_BYTES, 'Markdown report'),
            )
            process.stdout.write('verified\n')
            return
        }
        default:
            throw new Error(
                'Expected candidate, coverage, history, pool, judgment, selection, assemble, report, render, verify, verify-storage, or verify-markdown',
            )
    }
}

const formatZodPath = (path: PropertyKey[]): string =>
    path.reduce<string>(
        (formatted, segment) =>
            typeof segment === 'number'
                ? `${formatted}[${segment}]`
                : formatted.length === 0
                  ? String(segment)
                  : `${formatted}.${String(segment)}`,
        '',
    ) || '<root>'

const findZodError = (error: unknown): z.ZodError | null => {
    if (error instanceof z.ZodError) {
        return error
    }

    return error instanceof Error && error.cause instanceof z.ZodError ? error.cause : null
}

const safeZodIssueMessage = (issue: z.core.$ZodIssue): string =>
    issue.code === 'unrecognized_keys' ? 'Object contains unexpected keys' : issue.message

export const formatCliError = (error: unknown): string => {
    const zodError = findZodError(error)

    if (zodError !== null) {
        return `${zodError.issues
            .map((issue) => `${formatZodPath(issue.path)}: ${safeZodIssueMessage(issue)}`)
            .join('\n')}\n`
    }

    return `${error instanceof Error ? error.message : String(error)}\n`
}

const main = async (): Promise<void> => {
    try {
        await runCli(process.argv.slice(2))
    } catch (error) {
        process.stderr.write(formatCliError(error))
        process.exitCode = 1
    }
}

if (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    await main()
}
