import {
    parseOutreachContact,
    parseOutreachContacts,
    type OutreachContactInput,
    type UpdateOutreachContactInput,
} from '@job-search-facilitator/core'
import { apiUrl, parseApiResponse, readResponseError } from '@/api'

export async function fetchOutreachContacts(postId: string) {
    const path = `/job-posts/${encodeURIComponent(postId)}/outreach-contacts`
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseOutreachContacts, path)
}

export async function createOutreachContact(postId: string, input: OutreachContactInput) {
    const path = `/job-posts/${encodeURIComponent(postId)}/outreach-contacts`
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

    return parseApiResponse(response, parseOutreachContact, path)
}

export async function updateOutreachContact(
    postId: string,
    contactId: string,
    input: UpdateOutreachContactInput,
) {
    const path = `/job-posts/${encodeURIComponent(postId)}/outreach-contacts/${encodeURIComponent(contactId)}`
    const response = await fetch(`${apiUrl}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })

    return parseApiResponse(response, parseOutreachContact, path)
}

export async function removeOutreachContact(postId: string, contactId: string) {
    const path = `/job-posts/${encodeURIComponent(postId)}/outreach-contacts/${encodeURIComponent(contactId)}`
    const response = await fetch(`${apiUrl}${path}`, { method: 'DELETE' })

    if (!response.ok) {
        throw new Error(
            (await readResponseError(response)) ?? `API request failed (${response.status})`,
        )
    }
}
