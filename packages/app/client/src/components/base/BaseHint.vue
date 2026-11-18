<script setup lang="ts">
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { shallowRef, useId, useTemplateRef, watch } from 'vue'

defineProps<{
    /** The note that the control shows. */
    text: string
}>()

const id = `hint-${useId()}`
const control = useTemplateRef<HTMLElement>('control')
const note = useTemplateRef<HTMLElement>('note')
const open = shallowRef(false)
/** A press keeps the note open after the pointer leaves the control. */
const pinned = shallowRef(false)

function close() {
    open.value = false
    pinned.value = false
}

/** The first press keeps the note open. The next press closes it. */
function press() {
    pinned.value = !pinned.value
    open.value = pinned.value
}

/** A mouse or a pen shows the note on hover. A touch waits for the press. */
function enter(event: PointerEvent) {
    if (event.pointerType !== 'touch') open.value = true
}

/** The note stays open while the pointer moves between the control and the note. */
function leave(event: PointerEvent) {
    const next = event.relatedTarget as Node | null
    if (pinned.value || control.value?.contains(next) || note.value?.contains(next)) return
    open.value = false
}

/** Focus from the keyboard shows the note. Focus from a press waits for the click. */
function focus(event: FocusEvent) {
    if ((event.target as HTMLElement).matches(':focus-visible')) open.value = true
}

onClickOutside(control, close)
onKeyStroke('Escape', close)
watch(open, (isOpen) => note.value?.togglePopover(isOpen), { flush: 'post' })
</script>

<template>
    <button
        ref="control"
        type="button"
        class="base-hint"
        :style="`anchor-name: --${id}`"
        :aria-describedby="id"
        @pointerenter="enter"
        @pointerleave="leave"
        @focus="focus"
        @blur="close"
        @click="press"
    >
        <slot />
        <Teleport to="body">
            <span
                :id="id"
                ref="note"
                class="note tooltip-surface"
                :style="`position-anchor: --${id}`"
                role="tooltip"
                popover="manual"
                data-testid="hint-note"
                @pointerleave="leave"
                >{{ text }}</span
            >
        </Teleport>
    </button>
</template>

<style scoped lang="scss">
// :where keeps these resets weaker than the styles that a parent gives the control.
:where(.base-hint) {
    padding: 0;
    color: inherit;
    font: inherit;
    background: none;
    border: 0;
}

.base-hint {
    position: relative;

    // A larger area than the control takes a tap. It also joins the control to the note.
    &::before {
        position: absolute;
        inset: -$space-2;
        content: '';
    }

    &:focus-visible {
        outline: 2px solid $color-signal-light;
        outline-offset: 2px;
    }
}

// The browser puts the note below the control, or above it when the space below is too small.
.note {
    position-area: block-end;
    position-try-fallbacks: flip-block;
    inset: auto;
    max-width: min(14rem, calc(100vw - #{$space-6}));
    margin: $space-2 $space-3;
    white-space: normal;
}
</style>
