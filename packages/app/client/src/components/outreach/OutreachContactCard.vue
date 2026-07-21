<script setup lang="ts">
import type { OutreachContact } from '@job-search-facilitator/core'
import { computed, shallowRef, useId, watch } from 'vue'

const props = withDefaults(
    defineProps<{
        contact?: OutreachContact
        expanded?: boolean
        loading?: boolean
        selectable?: boolean
    }>(),
    {
        contact: undefined,
        expanded: false,
        loading: false,
        selectable: false,
    },
)

const emit = defineEmits<{
    select: []
}>()

const descriptionExpanded = shallowRef(false)
const rationaleExpanded = computed(() => props.expanded || descriptionExpanded.value)
const rationaleId = useId()

watch([() => props.contact?.id, () => props.expanded], () => {
    descriptionExpanded.value = false
})
</script>

<template>
    <article
        class="contact-card"
        :class="{ 'is-selectable': selectable && contact }"
        :aria-busy="loading || undefined"
    >
        <template v-if="loading">
            <span class="eyebrow">Relevant contact</span>
            <span class="loading-contact">
                <span class="contact-spinner" aria-hidden="true"></span>
                Discovering contact…
            </span>
        </template>

        <template v-else-if="contact">
            <button
                v-if="selectable"
                class="contact-select-button"
                type="button"
                :aria-label="`Open outreach draft for ${contact.personName}`"
                @click="emit('select')"
            ></button>

            <div class="contact-labels">
                <span class="eyebrow">Relevant contact</span>
                <span v-if="contact.messaged" class="messaged-status">Messaged</span>
            </div>
            <a
                class="person-name"
                :href="contact.profileUrl"
                target="_blank"
                rel="noopener noreferrer"
            >
                {{ contact.personName }} ↗
            </a>
            <span class="person-title">{{ contact.personTitle }}</span>
            <div class="rationale-copy">
                <p
                    :id="rationaleId"
                    class="relevance-rationale"
                    :class="{ 'is-clamped': !rationaleExpanded }"
                >
                    {{ contact.relevanceRationale }}
                </p>
                <button
                    v-if="!expanded"
                    class="rationale-toggle"
                    type="button"
                    :aria-controls="rationaleId"
                    :aria-expanded="descriptionExpanded"
                    @click="descriptionExpanded = !descriptionExpanded"
                >
                    {{ descriptionExpanded ? 'Show less' : 'Show more' }}
                </button>
            </div>
        </template>
    </article>
</template>

<style scoped lang="scss">
.contact-card {
    position: relative;
    display: grid;
    gap: $space-1;
    padding: $space-3;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;

    &.is-selectable:hover {
        border-color: $color-signal-light-alpha-50;
    }
}

.contact-select-button {
    position: absolute;
    z-index: 1;
    inset: 0;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: inherit;

    &:focus-visible {
        outline: 2px solid $color-signal-light;
        outline-offset: 2px;
    }
}

.contact-labels {
    display: flex;
    gap: $space-2;
    align-items: center;
    justify-content: space-between;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.messaged-status {
    padding: 0.15rem $space-2;
    color: $color-ink;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    letter-spacing: 0.04em;
    background: $color-signal-light-alpha-18;
    border-radius: $radius-sm;
    text-transform: uppercase;
}

.person-name,
.rationale-toggle {
    position: relative;
    z-index: 2;
}

.person-name {
    width: fit-content;
    color: $color-ink;
    font-size: 1.125rem;
    font-weight: 700;
    text-decoration: none;

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }
}

.person-title,
.relevance-rationale {
    color: $color-ink-secondary;
}

.rationale-copy {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.relevance-rationale {
    margin: 0;
    font-size: 0.875rem;

    &.is-clamped {
        display: -webkit-box;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
    }
}

.rationale-toggle {
    width: fit-content;
    padding: 0 $space-1 0 0;
    margin-left: auto;
    color: $color-signal-light;
    font: inherit;
    font-size: 0.875rem;
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

.loading-contact {
    display: flex;
    gap: $space-2;
    align-items: center;
    min-height: 2rem;
    color: $color-ink-secondary;
}

.contact-spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid $color-ink-alpha-50;
    border-top-color: $color-ink;
    border-radius: 50%;
    animation: contact-spin 0.8s linear infinite;
}

@keyframes contact-spin {
    to {
        transform: rotate(1turn);
    }
}
</style>
