export const readSessionStorage = (key: string): string | null => {
    try {
        return globalThis.sessionStorage.getItem(key)
    } catch {
        return null
    }
}

export const writeSessionStorage = (key: string, value: string | null): void => {
    try {
        if (value === null) {
            globalThis.sessionStorage.removeItem(key)
        } else {
            globalThis.sessionStorage.setItem(key, value)
        }
    } catch {
        // The page remains usable when storage is unavailable.
    }
}
