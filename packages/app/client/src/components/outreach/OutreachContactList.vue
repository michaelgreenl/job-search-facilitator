<script lang="ts">
export type OutreachContactFilter = 'all' | 'messaged' | 'not-messaged'
</script>

<script setup lang="ts">
import type { OutreachContact } from '@job-search-facilitator/core'
import { computed } from 'vue'
import AppDropdown, { type AppDropdownOption } from '@/components/app/AppDropdown.vue'

import OutreachContactCard from './OutreachContactCard.vue'

const contactFilterOptions: AppDropdownOption[] = [
    { value: 'all', label: 'All' },
    { value: 'messaged', label: 'Messaged', tone: 'success' },
    { value: 'not-messaged', label: 'Not Messaged', tone: 'muted' },
]

const isContactFilter = (value: string): value is OutreachContactFilter =>
    contactFilterOptions.some((option) => option.value === value)

const props = defineProps<{
    contacts: OutreachContact[]
    discovering: boolean
    error: string | null
    loading: boolean
}>()

const emit = defineEmits<{
    select: [contact: OutreachContact]
    showStream: []
    retry: []
}>()

const contactFilter = defineModel<OutreachContactFilter>('filter', { default: 'all' })
const filteredContacts = computed(() => {
    if (contactFilter.value === 'all') {
        return props.contacts
    }

    const messaged = contactFilter.value === 'messaged'
    return props.contacts.filter((contact) => contact.messaged === messaged)
})
const contactFilterLabel = computed(
    () => contactFilterOptions.find(({ value }) => value === contactFilter.value)?.label ?? 'All',
)

function selectContactFilter(value: string) {
    if (isContactFilter(value)) {
        contactFilter.value = value
    }
}
</script>

<template>
    <section
        class="contact-history"
        data-testid="outreach-contact-list"
        aria-labelledby="contact-history-title"
    >
        <div class="contact-history-heading">
            <div class="contact-history-summary">
                <h2 id="contact-history-title" class="contact-history-title">Saved contacts</h2>
                <span class="contact-history-count">{{ filteredContacts.length }}</span>
            </div>
            <AppDropdown
                class="contact-filter-dropdown"
                accessible-label="Filter saved contacts"
                test-id="contact-filter"
                :disabled="loading || contacts.length === 0"
                :options="contactFilterOptions"
                :label="contactFilterLabel"
                @select="selectContactFilter"
            />
        </div>

        <template v-if="error">
            <p class="contact-history-error" data-testid="outreach-contacts-error" role="alert">
                {{ error }}
            </p>
            <button
                class="retry-button"
                data-testid="outreach-contacts-retry"
                type="button"
                @click="emit('retry')"
            >
                Retry
            </button>
        </template>

        <template v-else>
            <ul v-if="discovering || filteredContacts.length > 0" class="contact-list">
                <li v-if="discovering">
                    <OutreachContactCard loading selectable @select="emit('showStream')" />
                </li>
                <li v-for="savedContact in filteredContacts" :key="savedContact.id">
                    <OutreachContactCard
                        :contact="savedContact"
                        selectable
                        @select="emit('select', savedContact)"
                    />
                </li>
            </ul>

            <p
                v-else-if="loading"
                class="contact-history-empty"
                data-testid="outreach-contacts-loading"
                role="status"
            >
                Loading saved contacts…
            </p>
            <p v-else-if="contacts.length > 0" class="contact-history-empty">
                No contacts match this filter.
            </p>
            <p v-else class="contact-history-empty">No saved contacts yet.</p>
        </template>
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
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
}

.contact-history-summary {
    display: flex;
    gap: $space-2;
    align-items: baseline;
}

.contact-history-title {
    margin: 0;
    font-size: 1rem;
}

.contact-history-count {
    color: $color-ink-muted;
    font-size: 0.75rem;
}

.contact-filter-dropdown {
    min-width: 7rem;
    margin-left: auto;
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

.retry-button {
    width: fit-content;
    padding: 0;
    color: $color-signal-light;
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        text-decoration: underline;
        text-underline-offset: 0.15em;
    }
}
</style>
