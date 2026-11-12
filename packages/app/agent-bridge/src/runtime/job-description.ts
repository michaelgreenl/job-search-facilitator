import { parseJobPostImportAgentResult } from '@job-search-facilitator/core'
import { z } from 'zod'

export const capturedDescriptionSchema = z.object({
    description: z.string().regex(/\S/),
    sourceUrl: z.url({ protocol: /^https?$/ }),
})
export type CapturedJobDescription = z.infer<typeof capturedDescriptionSchema>

export interface PageText {
    sourceUrl: string
    text: string
}

/**
 * Copies a description out of page text, from the first match of `start`
 * through the last match of `end`. Page text keeps its own spacing, so the
 * words match across any spacing.
 */
export function copyDescription(
    page: PageText,
    start: string,
    end: string,
): CapturedJobDescription | undefined {
    const words = (text: string) =>
        text
            .trim()
            .split(/\s+/)
            .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s+')
    const first = new RegExp(words(start)).exec(page.text)
    const last = [...page.text.matchAll(new RegExp(words(end), 'g'))].at(-1)
    if (!first || !last || last.index < first.index) return undefined

    return capturedDescriptionSchema.safeParse({
        description: page.text.slice(first.index, last.index + last[0].length),
        sourceUrl: page.sourceUrl,
    }).data
}

export function completeJobPostImport(
    text: string,
    captures: Map<string, CapturedJobDescription>,
): string {
    const { result } = parseJobPostImportAgentResult(JSON.parse(text))
    if ('error' in result) return JSON.stringify({ result })

    const { descriptionCaptureId, ...post } = result.post
    const capture = captures.get(descriptionCaptureId)
    if (capture === undefined)
        throw new Error('The job description was not captured for this import. Try again.')

    const sourceUrl = new URL(capture.sourceUrl)
    const postUrl = new URL(post.postUrl)
    sourceUrl.hash = postUrl.hash = ''
    if (sourceUrl.href !== postUrl.href) {
        throw new Error('The captured description does not match the job-post URL. Try again.')
    }
    return JSON.stringify({
        result: { ...result, post: { ...post, description: capture.description } },
    })
}
