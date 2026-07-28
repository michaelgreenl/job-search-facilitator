<script setup lang="ts">
import { computed, shallowRef, useId, useTemplateRef, watch } from 'vue'

const props = withDefaults(
    defineProps<{
        busy?: boolean
        issue?: string | null
        open: boolean
    }>(),
    {
        busy: false,
        issue: null,
    },
)

const emit = defineEmits<{
    close: []
    submit: [url: string]
}>()

const url = defineModel<string>('url', { required: true })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = `job-post-url-title-${useId()}`
const errorId = `job-post-url-error-${useId()}`
const urlError = shallowRef<string | null>(null)
const displayError = computed(() => urlError.value ?? props.issue)

watch(
    [() => props.open, dialog],
    ([open, element]) => {
        if (element === null) {
            return
        }

        if (open && !element.open) {
            if (typeof element.showModal === 'function') {
                element.showModal()
            } else {
                element.setAttribute('open', '')
            }
        } else if (!open && element.open) {
            if (typeof element.close === 'function') {
                element.close()
            } else {
                element.removeAttribute('open')
            }
        }

        if (!open) {
            urlError.value = null
        }
    },
    { immediate: true, flush: 'post' },
)

function requestClose() {
    emit('close')
}

function handleNativeClose() {
    if (props.open) {
        emit('close')
    }
}

function submit() {
    const value = url.value.trim()

    try {
        const parsedUrl = new URL(value)

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error()
        }

        urlError.value = null
        emit('submit', parsedUrl.href)
    } catch {
        urlError.value = 'Enter a valid http or https job-post URL.'
    }
}
</script>

<template>
    <dialog
        ref="dialog"
        class="job-post-url-dialog glass-frame"
        data-testid="job-post-url-dialog"
        :aria-labelledby="titleId"
        @cancel.prevent="requestClose"
        @close="handleNativeClose"
    >
        <header class="dialog-header">
            <h2 :id="titleId" class="dialog-title">Add job post</h2>
            <button
                class="close-button"
                data-testid="close-job-post-url-dialog"
                type="button"
                aria-label="Close add job post"
                @click="requestClose"
            >
                <span aria-hidden="true">×</span>
            </button>
        </header>

        <form class="url-form" data-testid="job-post-url-form" novalidate @submit.prevent="submit">
            <div class="url-entry">
                <input
                    id="job-post-url"
                    v-model="url"
                    class="url-input"
                    data-testid="job-post-url"
                    type="url"
                    inputmode="url"
                    autocomplete="url"
                    aria-label="Job post URL"
                    placeholder="Job post URL for agent to review"
                    :aria-describedby="displayError ? errorId : undefined"
                    :aria-invalid="displayError !== null"
                    :disabled="busy"
                    autofocus
                    @input="urlError = null"
                />
                <button
                    class="submit-button"
                    data-testid="start-job-post-import"
                    type="submit"
                    aria-label="Add job post"
                    title="Add job post"
                    :disabled="busy"
                >
                    <span aria-hidden="true">→</span>
                </button>
            </div>

            <p
                v-if="displayError"
                :id="errorId"
                class="form-error"
                data-testid="job-post-url-error"
                role="alert"
            >
                {{ displayError }}
            </p>
        </form>
    </dialog>
</template>

<style scoped lang="scss">
.job-post-url-dialog {
    width: min(25rem, calc(100vw - (#{$space-6} * 2)));
    padding: $space-4;
    color: $color-ink;
    border-radius: $radius-lg;

    &::backdrop {
        background: $color-black-alpha-28;
        backdrop-filter: blur(3px);
    }
}

.dialog-header {
    display: flex;
    gap: $space-3;
    align-items: center;
    margin-bottom: $space-3;
}

.dialog-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
}

.close-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    margin-left: auto;
    padding: 0;
    color: $color-ink-muted;
    font: inherit;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        color: $color-ink;
    }
}

.url-form {
    display: grid;
    gap: $space-2;
}

.url-entry {
    display: flex;
    gap: $space-2;
    align-items: center;
}

.url-input {
    flex: 1 1 auto;
    height: 2.75rem;
    min-width: 0;
    padding: $space-2 $space-3;
    color: $color-ink;
    font: inherit;
    background: $color-ink-alpha-6;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-md;

    &::placeholder {
        color: $color-ink-muted;
    }

    &:focus-visible {
        border-color: $color-signal-light;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }
}

.submit-button {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    color: $color-ink;
    font: inherit;
    font-size: 1.25rem;
    font-weight: 650;
    line-height: 1;
    cursor: pointer;
    background: $color-action;
    border: 1px solid transparent;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        background: $color-signal;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.55;
    }
}

.form-error {
    margin: 0;
    color: lighten-color($color-red-600, 20%);
    font-size: 0.8125rem;
}
</style>
