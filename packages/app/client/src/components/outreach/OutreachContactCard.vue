<script setup lang="ts">
import type { OutreachContact } from '@job-search-facilitator/core'
import {
    computed,
    nextTick,
    onBeforeUnmount,
    onMounted,
    shallowRef,
    useId,
    useTemplateRef,
    watch,
} from 'vue'
import LoadingSpinner from '@/components/app/LoadingSpinner.vue'

const OVERFLOW_TOLERANCE_PX = 1

const props = withDefaults(
    defineProps<{
        contact?: OutreachContact
        expanded?: boolean
        loading?: boolean
        messagedError?: string | null
        messagedUpdating?: boolean
        selectable?: boolean
        showMessagedControl?: boolean
    }>(),
    {
        contact: undefined,
        expanded: false,
        loading: false,
        messagedError: null,
        messagedUpdating: false,
        selectable: false,
        showMessagedControl: false,
    },
)

const emit = defineEmits<{
    select: []
    updateMessaged: [messaged: boolean]
}>()

const descriptionExpanded = shallowRef(false)
const rationaleExpanded = computed(() => props.expanded || descriptionExpanded.value)
const rationaleId = useId()
const rationaleElement = useTemplateRef<HTMLElement>('rationale')
const rationaleOverflowing = shallowRef(false)
const showRationaleToggle = computed(() => !props.expanded && rationaleOverflowing.value)
let rationaleResizeObserver: ResizeObserver | null = null
const selectionLabel = computed(() => {
    if (!props.selectable) {
        return null
    }

    if (props.loading) {
        return 'View outreach progress'
    }

    return props.contact ? `Open outreach draft for ${props.contact.personName}` : null
})

function updateRationaleOverflow() {
    const element = rationaleElement.value

    if (element === null) {
        rationaleOverflowing.value = false
        return
    }

    if (rationaleExpanded.value) {
        return
    }

    rationaleOverflowing.value = element.scrollHeight - element.clientHeight > OVERFLOW_TOLERANCE_PX
}

async function updateRationaleOverflowAfterRender() {
    await nextTick()
    updateRationaleOverflow()
}

function toggleRationale() {
    descriptionExpanded.value = !descriptionExpanded.value

    if (!descriptionExpanded.value) {
        void updateRationaleOverflowAfterRender()
    }
}

function updateMessaged(event: Event) {
    const checkbox = event.currentTarget as HTMLInputElement
    const messaged = checkbox.checked
    // Keep the control aligned with persisted state until the PATCH response arrives.
    checkbox.checked = props.contact?.messaged ?? false
    emit('updateMessaged', messaged)
}

watch(
    [() => props.contact?.id, () => props.contact?.relevanceRationale, () => props.expanded],
    () => {
        descriptionExpanded.value = false
        rationaleOverflowing.value = false
        void updateRationaleOverflowAfterRender()
    },
)

watch(
    rationaleElement,
    (element) => {
        rationaleResizeObserver?.disconnect()
        rationaleResizeObserver = null
        rationaleOverflowing.value = false

        if (typeof ResizeObserver !== 'undefined' && element !== null) {
            rationaleResizeObserver = new ResizeObserver(updateRationaleOverflow)
            rationaleResizeObserver.observe(element)
        }

        void updateRationaleOverflowAfterRender()
    },
    { flush: 'post' },
)

onMounted(() => {
    if (typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', updateRationaleOverflow)
    }
})

onBeforeUnmount(() => {
    rationaleResizeObserver?.disconnect()
    window.removeEventListener('resize', updateRationaleOverflow)
})
</script>

<template>
    <article
        class="contact-card"
        :class="{ 'is-selectable': selectionLabel !== null }"
        :aria-busy="loading || messagedUpdating || undefined"
    >
        <button
            v-if="selectionLabel"
            class="contact-select-button"
            type="button"
            :aria-label="selectionLabel"
            @click="emit('select')"
        ></button>

        <template v-if="loading">
            <span class="eyebrow">Relevant contact</span>
            <span class="loading-contact">
                <LoadingSpinner class="contact-spinner" />
                Discovering contact…
            </span>
        </template>

        <template v-else-if="contact">
            <div class="contact-labels">
                <span class="eyebrow">Relevant contact</span>
                <span v-if="contact.messaged && !showMessagedControl" class="messaged-status">
                    Messaged
                </span>
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
                    ref="rationale"
                    class="relevance-rationale"
                    :class="{ 'is-clamped': !rationaleExpanded }"
                >
                    {{ contact.relevanceRationale }}
                </p>
                <div v-if="showMessagedControl || showRationaleToggle" class="contact-actions">
                    <label
                        v-if="showMessagedControl"
                        class="messaged-checkbox"
                        :class="{ 'is-updating': messagedUpdating }"
                    >
                        <input
                            type="checkbox"
                            :checked="contact.messaged"
                            :disabled="messagedUpdating"
                            @change="updateMessaged"
                        />
                        <span>Messaged</span>
                    </label>
                    <button
                        v-if="showRationaleToggle"
                        class="rationale-toggle"
                        type="button"
                        :aria-controls="rationaleId"
                        :aria-expanded="descriptionExpanded"
                        @click="toggleRationale"
                    >
                        {{ descriptionExpanded ? 'Show less' : 'Show more' }}
                    </button>
                </div>
                <p v-if="showMessagedControl && messagedError" class="messaged-error" role="alert">
                    {{ messagedError }}
                </p>
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
    display: inline-flex;
    width: fit-content;
    gap: $space-1;
    align-items: center;
    padding: $space-1 $space-2;
    color: lighten-color($color-green-600, 35%);
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    background: $color-green-600-alpha-25;
    border: 1px solid $color-green-600-alpha-55;
    border-radius: $radius-full;
}

.contact-actions {
    position: relative;
    z-index: 2;
    display: flex;
    gap: $space-2;
    align-items: center;
    min-width: 0;
    margin-top: $space-2;
}

.messaged-checkbox {
    display: inline-flex;
    gap: $space-2;
    align-items: center;
    width: fit-content;
    color: $color-ink-secondary;
    font-size: 0.8125rem;
    cursor: pointer;

    input {
        width: 1rem;
        height: 1rem;
        margin: 0;
        accent-color: $color-action;
    }

    &.is-updating {
        cursor: wait;
        opacity: 0.55;
    }
}

.messaged-error {
    position: relative;
    z-index: 2;
    margin: $space-1 0 0;
    color: lighten-color($color-red-600, 20%);
    font-size: 0.75rem;
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
</style>
