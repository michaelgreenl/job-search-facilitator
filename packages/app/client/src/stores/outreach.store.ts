import type {
    JsonObject,
    OutreachContact,
    OutreachContactInput,
} from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { request } from '@/api'

type OutreachTaskKind = 'contact' | 'draft'

const outputText = (output: JsonObject, key: string) => {
    const value = output[key]

    return typeof value === 'string' && value.trim() ? value.trim() : null
}

const profileUrl = (output: JsonObject) => {
    const value = outputText(output, 'profileUrl')

    if (value === null) {
        return null
    }

    try {
        const url = new URL(value)
        const isLinkedIn = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')

        return url.protocol === 'https:' && isLinkedIn && url.pathname.startsWith('/in/')
            ? url.href
            : null
    } catch {
        return null
    }
}

export const useOutreachStore = defineStore('outreach', () => {
    const postId = shallowRef<string | null>(null)
    const contacts = shallowRef<OutreachContact[]>([])
    const contact = shallowRef<OutreachContact | null>(null)
    const draft = shallowRef('')
    const assistantReply = shallowRef<string | null>(null)
    const taskKind = shallowRef<OutreachTaskKind | null>(null)
    const resultError = shallowRef<string | null>(null)
    const contactsLoading = shallowRef(false)
    const contactsError = shallowRef<string | null>(null)
    const discovering = computed(() => taskKind.value === 'contact')

    function begin(post: string) {
        if (postId.value !== post) {
            contacts.value = []
        }

        postId.value = post
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        taskKind.value = 'contact'
        resultError.value = null
    }

    async function fetchContacts(post: string) {
        contactsLoading.value = true
        contactsError.value = null

        try {
            const savedContacts = await request<OutreachContact[]>(
                `/job-posts/${encodeURIComponent(post)}/outreach-contacts`,
            )

            if (postId.value === post) {
                contacts.value = savedContacts
            }
        } catch (error) {
            if (postId.value === post) {
                contactsError.value =
                    error instanceof Error ? error.message : 'Could not load outreach contacts'
            }

            throw error
        } finally {
            if (postId.value === post) {
                contactsLoading.value = false
            }
        }
    }

    function selectContact(selectedContact: OutreachContact) {
        contact.value = selectedContact
        draft.value = selectedContact.draftMessage
        assistantReply.value = null
        resultError.value = null
    }

    function clearContact() {
        contact.value = null
        draft.value = ''
        assistantReply.value = null
    }

    function beginDraft() {
        assistantReply.value = null
        taskKind.value = 'draft'
        resultError.value = null
    }

    async function applyTaskResult(output: JsonObject): Promise<OutreachContact | null> {
        if (taskKind.value === 'contact') {
            const personName = outputText(output, 'personName')
            const personTitle = outputText(output, 'personTitle')
            const linkedInUrl = profileUrl(output)
            const relevanceRationale = outputText(output, 'relevanceRationale')
            const draftMessage = outputText(output, 'draftMessage')

            if (
                personName === null ||
                personTitle === null ||
                linkedInUrl === null ||
                relevanceRationale === null ||
                draftMessage === null
            ) {
                failResult('Work returned an invalid outreach result')
                return null
            }

            const activePostId = postId.value
            const input: OutreachContactInput = {
                personName,
                personTitle,
                profileUrl: linkedInUrl,
                relevanceRationale,
                draftMessage,
            }
            taskKind.value = null

            if (activePostId === null) {
                failResult('Could not associate the outreach contact with a job post')
                return null
            }

            try {
                const savedContact = await request<OutreachContact>(
                    `/job-posts/${encodeURIComponent(activePostId)}/outreach-contacts`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(input),
                    },
                )

                if (postId.value === activePostId) {
                    contacts.value = [
                        savedContact,
                        ...contacts.value.filter(({ id }) => id !== savedContact.id),
                    ]
                    resultError.value = null
                }

                return savedContact
            } catch (error) {
                if (postId.value === activePostId) {
                    resultError.value =
                        error instanceof Error ? error.message : 'Could not save outreach contact'
                }

                return null
            }
        } else if (taskKind.value === 'draft') {
            const draftMessage = outputText(output, 'draftMessage')
            const response = outputText(output, 'response')

            if (draftMessage === null || response === null) {
                failResult('Work returned an invalid draft result')
                return null
            }

            draft.value = draftMessage
            assistantReply.value = response
        } else {
            return null
        }

        taskKind.value = null
        resultError.value = null
        return null
    }

    function failResult(message: string) {
        taskKind.value = null
        resultError.value = message
    }

    function cancelTask() {
        taskKind.value = null
        resultError.value = null
    }

    function reset() {
        postId.value = null
        contacts.value = []
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        taskKind.value = null
        resultError.value = null
        contactsLoading.value = false
        contactsError.value = null
    }

    return {
        postId,
        contacts,
        contact,
        draft,
        assistantReply,
        resultError,
        contactsLoading,
        contactsError,
        discovering,
        begin,
        fetchContacts,
        selectContact,
        clearContact,
        beginDraft,
        applyTaskResult,
        cancelTask,
        reset,
    }
})
