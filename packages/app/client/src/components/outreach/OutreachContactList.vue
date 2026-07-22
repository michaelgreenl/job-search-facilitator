<script setup lang="ts">
import type { OutreachContact } from '@job-search-facilitator/core'

import OutreachContactCard from './OutreachContactCard.vue'

defineProps<{
    contacts: OutreachContact[]
    discovering: boolean
    error: string | null
    loading: boolean
}>()

const emit = defineEmits<{
    select: [contact: OutreachContact]
    showStream: []
}>()
</script>

<template>
    <section class="contact-history" aria-labelledby="contact-history-title">
        <div class="contact-history-heading">
            <h2 id="contact-history-title" class="contact-history-title">Saved contacts</h2>
            <span class="contact-history-count">{{ contacts.length }}</span>
        </div>

        <p v-if="error" class="contact-history-error" role="alert">{{ error }}</p>

        <ul v-if="discovering || contacts.length > 0" class="contact-list">
            <li v-if="discovering">
                <OutreachContactCard loading selectable @select="emit('showStream')" />
            </li>
            <li v-for="savedContact in contacts" :key="savedContact.id">
                <OutreachContactCard
                    :contact="savedContact"
                    selectable
                    @select="emit('select', savedContact)"
                />
            </li>
        </ul>

        <p v-else-if="loading" class="contact-history-empty">Loading saved contacts…</p>
        <p v-else class="contact-history-empty">No saved contacts yet.</p>
    </section>
</template>

<style scoped lang="scss">
.contact-history {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $space-3;
    min-height: 0;
}

.contact-history-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
}

.contact-history-title {
    margin: 0;
    font-size: 1rem;
}

.contact-history-count {
    color: $color-ink-muted;
    font-size: 0.75rem;
}

.contact-list {
    display: grid;
    gap: $space-3;
    min-height: 0;
    padding: 0;
    margin: 0;
    overflow-y: auto;
    list-style: none;
}

.contact-history-empty,
.contact-history-error {
    margin: 0;
    font-size: 0.875rem;
}

.contact-history-empty {
    color: $color-ink-muted;
}

.contact-history-error {
    color: lighten-color($color-red-600, 20%);
}
</style>
