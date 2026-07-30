const contactListReturnStorageKey = 'job-search-facilitator:outreach-contact-list-return'

const getSessionStorage = () => {
    try {
        return globalThis.sessionStorage ?? null
    } catch {
        return null
    }
}

export const readOutreachContactListReturn = () => {
    const storage = getSessionStorage()

    if (storage === null) {
        return null
    }

    try {
        const postId = storage.getItem(contactListReturnStorageKey)
        return postId?.trim() ? postId : null
    } catch {
        return null
    }
}

export const writeOutreachContactListReturn = (postId: string) => {
    try {
        getSessionStorage()?.setItem(contactListReturnStorageKey, postId)
    } catch {
        // The current panel remains usable when storage is unavailable.
    }
}

export const clearOutreachContactListReturn = () => {
    try {
        getSessionStorage()?.removeItem(contactListReturnStorageKey)
    } catch {
        // The current panel remains usable when storage is unavailable.
    }
}
