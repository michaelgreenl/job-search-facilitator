import type {
    JsonObject,
    OutreachContact,
    OutreachContactInput,
    UpdateOutreachContactInput,
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
    const contactSaving = shallowRef(false)
    const contactUpdating = shallowRef(false)
    const contactUpdateError = shallowRef<string | null>(null)
    const resultError = shallowRef<string | null>(null)
    const contactsLoading = shallowRef(false)
    const contactsError = shallowRef<string | null>(null)
    const discovering = computed(() => taskKind.value === 'contact')
    const drafting = computed(() => taskKind.value === 'draft')
    let resultRevision = 0
    let contactRequestRevision = 0
    let contactUpdateRevision = 0

    function openForPost(post: string) {
        resultRevision += 1
        contactRequestRevision += 1
        contactUpdateRevision += 1
        contactsLoading.value = false
        contactsError.value = null
        contactUpdating.value = false
        contactUpdateError.value = null

        if (postId.value !== post) {
            contacts.value = []
        }

        postId.value = post
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        taskKind.value = null
        contactSaving.value = false
        resultError.value = null
    }

    function beginDiscovery(post: string) {
        openForPost(post)
        taskKind.value = 'contact'
    }

    async function fetchContacts(post: string) {
        const requestRevision = ++contactRequestRevision
        contactsLoading.value = true
        contactsError.value = null

        try {
            const savedContacts = await request<OutreachContact[]>(
                `/job-posts/${encodeURIComponent(post)}/outreach-contacts`,
            )

            if (postId.value !== post || contactRequestRevision !== requestRevision) {
                return null
            }

            contacts.value = savedContacts
            return savedContacts
        } catch (error) {
            if (postId.value !== post || contactRequestRevision !== requestRevision) {
                return null
            }

            contactsError.value =
                error instanceof Error ? error.message : 'Could not load outreach contacts'
            throw error
        } finally {
            if (postId.value === post && contactRequestRevision === requestRevision) {
                contactsLoading.value = false
            }
        }
    }

    function selectContact(selectedContact: OutreachContact) {
        contact.value = selectedContact
        draft.value = selectedContact.draftMessage
        assistantReply.value = null
        resultError.value = null
        contactUpdateError.value = null
    }

    function clearContact() {
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        contactUpdateError.value = null
    }

    async function updateContactMessaged(contactId: string, messaged: boolean) {
        const activePostId = postId.value

        if (activePostId === null || contactUpdating.value) {
            return null
        }

        const updateRevision = ++contactUpdateRevision
        const input: UpdateOutreachContactInput = { messaged }
        contactUpdating.value = true
        contactUpdateError.value = null

        try {
            const updatedContact = await request<OutreachContact>(
                `/job-posts/${encodeURIComponent(activePostId)}/outreach-contacts/${encodeURIComponent(contactId)}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(input),
                },
            )

            if (postId.value !== activePostId || contactUpdateRevision !== updateRevision) {
                return null
            }

            contacts.value = contacts.value.map((savedContact) =>
                savedContact.id === updatedContact.id ? updatedContact : savedContact,
            )

            if (contact.value?.id === updatedContact.id) {
                contact.value = updatedContact
            }

            return updatedContact
        } catch (error) {
            if (
                postId.value === activePostId &&
                contactUpdateRevision === updateRevision &&
                contact.value?.id === contactId
            ) {
                contactUpdateError.value =
                    error instanceof Error ? error.message : 'Could not update contact status'
            }

            throw error
        } finally {
            if (postId.value === activePostId && contactUpdateRevision === updateRevision) {
                contactUpdating.value = false
            }
        }
    }

    function beginDraft() {
        resultRevision += 1
        assistantReply.value = null
        taskKind.value = 'draft'
        contactSaving.value = false
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
            const activeResultRevision = resultRevision
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

            contactSaving.value = true

            try {
                const savedContact = await request<OutreachContact>(
                    `/job-posts/${encodeURIComponent(activePostId)}/outreach-contacts`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(input),
                    },
                )

                if (postId.value !== activePostId || resultRevision !== activeResultRevision) {
                    return null
                }

                contacts.value = [
                    savedContact,
                    ...contacts.value.filter(({ id }) => id !== savedContact.id),
                ]
                resultError.value = null

                return savedContact
            } catch (error) {
                if (postId.value === activePostId && resultRevision === activeResultRevision) {
                    resultError.value =
                        error instanceof Error ? error.message : 'Could not save outreach contact'
                }

                return null
            } finally {
                if (postId.value === activePostId && resultRevision === activeResultRevision) {
                    contactSaving.value = false
                }
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
        contactSaving.value = false
        resultError.value = message
    }

    function cancelTask() {
        resultRevision += 1
        taskKind.value = null
        contactSaving.value = false
        resultError.value = null
    }

    function reset() {
        resultRevision += 1
        contactRequestRevision += 1
        contactUpdateRevision += 1
        postId.value = null
        contacts.value = []
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        taskKind.value = null
        contactSaving.value = false
        contactUpdating.value = false
        contactUpdateError.value = null
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
        contactSaving,
        contactUpdating,
        contactUpdateError,
        resultError,
        contactsLoading,
        contactsError,
        discovering,
        drafting,
        openForPost,
        beginDiscovery,
        fetchContacts,
        selectContact,
        clearContact,
        updateContactMessaged,
        beginDraft,
        applyTaskResult,
        cancelTask,
        reset,
    }
})
