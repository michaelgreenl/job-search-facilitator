<script setup lang="ts">
import { computed, useId, useTemplateRef, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
    closeLabel?: string
    closeTestId?: string
    error?: string | null
    errorTestId?: string
    heading: string
    open: boolean
}>()

const emit = defineEmits<{
    close: []
}>()

defineSlots<{
    default?(props: { errorId: string }): unknown
}>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = `pop-up-title-${useId()}`
const errorId = `pop-up-error-${useId()}`
const accessibleCloseLabel = computed(() => props.closeLabel ?? `Close ${props.heading}`)

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
    },
    { immediate: true, flush: 'post' },
)

function handleNativeClose() {
    if (props.open) {
        emit('close')
    }
}
</script>

<template>
    <dialog
        ref="dialog"
        v-bind="$attrs"
        class="base-pop-up glass-frame"
        :aria-labelledby="titleId"
        @cancel.prevent="emit('close')"
        @close="handleNativeClose"
    >
        <header class="pop-up-header">
            <h2 :id="titleId" class="pop-up-title">{{ heading }}</h2>
            <BaseButton
                class="close-button"
                :data-testid="closeTestId"
                icon-size="sm"
                preset="icon"
                :aria-label="accessibleCloseLabel"
                @click="emit('close')"
            >
                <span aria-hidden="true">×</span>
            </BaseButton>
        </header>

        <slot :error-id="errorId" />

        <p v-if="error" :id="errorId" class="pop-up-error" :data-testid="errorTestId" role="alert">
            {{ error }}
        </p>
    </dialog>
</template>

<style scoped lang="scss">
.base-pop-up {
    width: min(25rem, calc(100vw - (#{$space-6} * 2)));
    padding: $space-3 $space-4 $space-4;
    color: $color-ink;
    border-radius: $radius-lg;

    &::backdrop {
        background: $color-black-alpha-28;
        backdrop-filter: blur(3px);
    }
}

.pop-up-header {
    display: flex;
    gap: $space-3;
    align-items: center;
    margin-bottom: $space-2;
}

.pop-up-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
}

.close-button {
    margin-left: auto;
    font-size: 1.5rem;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible {
        color: $color-ink;
    }
}

.pop-up-error {
    margin: $space-2 0 0;
    color: lighten-color($color-red-600, 20%);
    font-size: 0.8125rem;
}
</style>
