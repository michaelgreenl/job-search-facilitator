import type { RuntimeParser } from '@job-search-facilitator/core'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

const readErrorMessage = async (response: Response) => {
    const body: unknown = await response.json().catch(() => null)

    if (
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        !('error' in body) ||
        typeof body.error !== 'string'
    ) {
        return null
    }

    return body.error.trim() || null
}

export const parseJsonResponse = async <T>(
    response: Response,
    parser: RuntimeParser<T>,
    source: string,
): Promise<T> => {
    try {
        const value: unknown = await response.json()

        return parser(value)
    } catch (cause) {
        throw new Error(`${source} returned invalid data`, { cause })
    }
}

export const request = async <T>(
    path: string,
    parser: RuntimeParser<T>,
    init?: RequestInit,
): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, init)

    if (!response.ok) {
        throw new Error(
            (await readErrorMessage(response)) ?? `API request failed (${response.status})`,
        )
    }

    return parseJsonResponse(response, parser, `API ${path}`)
}
