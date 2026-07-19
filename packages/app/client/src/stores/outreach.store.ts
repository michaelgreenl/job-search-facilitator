import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export const useOutreachStore = defineStore('outreach', () => {
    const postId = shallowRef<string | null>(null)

    return { postId }
})
