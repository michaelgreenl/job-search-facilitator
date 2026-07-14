const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

export const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, init)

    if (!response.ok) {
        throw new Error(`API request failed (${response.status})`)
    }

    return response.json() as Promise<T>
}
