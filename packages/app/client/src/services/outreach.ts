import {
    parseOutreachContact,
    parseOutreachContacts,
    type ContactDiscoveryResult,
    type UpdateOutreachContactInput,
} from '@job-search-facilitator/core'
import { parseApiResponse } from '@/services/api-response'

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

export async function fetchOutreachContacts(postId: string) {
    const path = `/job-posts/${encodeURIComponent(postId)}/outreach-contacts`
    const response = await fetch(`${apiUrl}${path}`, undefined)

    return parseApiResponse(response, parseOutreachContacts, path)
}

export async function createOutreachContact(postId: string, input: ContactDiscoveryResult) {
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
