import type { RuntimeParser } from '@job-search-facilitator/core'

export const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(
    /\/$/,
    '',
)

export const readResponseError = async (response: Response) => {
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

export const parseApiResponse = async <T>(
    response: Response,
    parser: RuntimeParser<T>,
    path: string,
) => {
    if (!response.ok) {
        throw new Error(
            (await readResponseError(response)) ?? `API request failed (${response.status})`,
        )
    }

    return parseJsonResponse(response, parser, `API ${path}`)
}
