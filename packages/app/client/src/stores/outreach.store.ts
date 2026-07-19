import type { JsonObject } from '@job-search-facilitator/core'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { OutreachContact } from '@/work-tasks'

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
    const contact = shallowRef<OutreachContact | null>(null)
    const draft = shallowRef('')
    const assistantReply = shallowRef<string | null>(null)
    const taskKind = shallowRef<OutreachTaskKind | null>(null)
    const resultError = shallowRef<string | null>(null)

    function begin(post: string) {
        if (postId.value !== post) {
            contact.value = null
            draft.value = ''
            assistantReply.value = null
        }

        postId.value = post
        taskKind.value = 'contact'
        resultError.value = null
    }

    function beginDraft() {
        assistantReply.value = null
        taskKind.value = 'draft'
        resultError.value = null
    }

    function applyTaskResult(output: JsonObject) {
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
                return
            }

            contact.value = {
                personName,
                personTitle,
                profileUrl: linkedInUrl,
                relevanceRationale,
            }
            draft.value = draftMessage
            assistantReply.value = null
        } else if (taskKind.value === 'draft') {
            const draftMessage = outputText(output, 'draftMessage')
            const response = outputText(output, 'response')

            if (draftMessage === null || response === null) {
                failResult('Work returned an invalid draft result')
                return
            }

            draft.value = draftMessage
            assistantReply.value = response
        } else {
            return
        }

        taskKind.value = null
        resultError.value = null
    }

    function failResult(message: string) {
        taskKind.value = null
        resultError.value = message
    }

    function reset() {
        postId.value = null
        contact.value = null
        draft.value = ''
        assistantReply.value = null
        taskKind.value = null
        resultError.value = null
    }

    return {
        postId,
        contact,
        draft,
        assistantReply,
        resultError,
        begin,
        beginDraft,
        applyTaskResult,
        reset,
    }
})
