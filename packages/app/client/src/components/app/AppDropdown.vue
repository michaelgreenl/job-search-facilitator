<script lang="ts">
export type AppDropdownTone =
    | 'default'
    | 'muted'
    | 'priority-high'
    | 'priority-medium'
    | 'quick'
    | 'success'

export interface AppDropdownOption {
    value: string
    label: string
    tone?: AppDropdownTone
    separatorBefore?: boolean
}
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue'
import ChevronDownIcon from '@/components/svgs/ChevronDownIcon.vue'

const props = defineProps<{
    buttonLabel: string
    disabled: boolean
    options: AppDropdownOption[]
    label: string
    testId?: string
}>()

const emit = defineEmits<{
    select: [value: string]
}>()

const menuId = useId()
const open = shallowRef(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLElement>('menu')

const optionButtons = () => [
    ...(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
]

function focusOption(index: number) {
    const buttons = optionButtons()
    buttons.at(Math.max(0, Math.min(index, buttons.length - 1)))?.focus()
}

async function showMenu(focus: 'first' | 'last' = 'first') {
    if (props.disabled) {
        return
    }

    open.value = true
    await nextTick()
    focusOption(focus === 'first' ? 0 : optionButtons().length - 1)
}

function hideMenu(restoreFocus = false) {
    open.value = false

    if (restoreFocus) {
        void nextTick(() => trigger.value?.focus())
    }
}

function toggleMenu() {
    if (open.value) {
        hideMenu(true)
    } else {
        void showMenu()
    }
}

function moveFocus(offset: number) {
    const buttons = optionButtons()

    if (buttons.length === 0) {
        return
    }

    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = (currentIndex + offset + buttons.length) % buttons.length
    buttons[nextIndex]?.focus()
}

function selectOption(value: string) {
    emit('select', value)
    hideMenu(true)
}

function handleOutsidePointer(event: PointerEvent) {
    if (open.value && !root.value?.contains(event.target as Node)) {
        hideMenu()
    }
}

watch(
    () => props.disabled,
    (disabled) => {
        if (disabled) {
            hideMenu()
        }
    },
)

onMounted(() => document.addEventListener('pointerdown', handleOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleOutsidePointer))
</script>

<template>
    <div ref="root" class="app-dropdown">
        <button
            ref="trigger"
            class="trigger"
            type="button"
            :data-testid="testId ? `${testId}-trigger` : undefined"
            aria-haspopup="menu"
            :aria-label="buttonLabel"
            :aria-controls="menuId"
            :aria-expanded="open"
            :disabled="disabled"
            @click="toggleMenu"
            @keydown.down.prevent="showMenu('first')"
            @keydown.up.prevent="showMenu('last')"
        >
            <span>{{ label }}</span>
            <ChevronDownIcon class="chevron" />
        </button>

        <ul
            v-if="open"
            :id="menuId"
            ref="menu"
            class="list glass-frame"
            :data-testid="testId ? `${testId}-menu` : undefined"
            role="menu"
            :aria-label="buttonLabel"
            @keydown.down.prevent="moveFocus(1)"
            @keydown.up.prevent="moveFocus(-1)"
            @keydown.home.prevent="focusOption(0)"
            @keydown.end.prevent="focusOption(optionButtons().length - 1)"
            @keydown.esc.prevent="hideMenu(true)"
            @keydown.tab="hideMenu()"
        >
            <li
                v-for="option in options"
                :key="option.value"
                class="option"
                :class="{ 'has-separator': option.separatorBefore }"
                role="none"
            >
                <button
                    class="item"
                    :class="`item-${option.tone ?? 'default'}`"
                    type="button"
                    :data-testid="testId ? `${testId}-option-${option.value}` : undefined"
                    role="menuitem"
                    tabindex="-1"
                    @click="selectOption(option.value)"
                >
                    <span class="marker" aria-hidden="true"></span>
                    <span>{{ option.label }}</span>
                </button>
            </li>
        </ul>
    </div>
</template>

<style scoped lang="scss">
.app-dropdown {
    position: relative;
    display: inline-flex;
}

.trigger {
    display: inline-flex;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 2.5rem;
    padding: 0 $space-3;
    color: $color-ink;
    font: inherit;
    cursor: pointer;
    background: $color-ink-alpha-6;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-md;

    &:hover,
    &:focus-visible,
    &[aria-expanded='true'] {
        background: $color-signal-alpha-10;
        border-color: $color-signal-alpha-45;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
}

.chevron {
    width: 0.875rem;
    height: 0.875rem;
    fill: none;
    stroke: $color-ink-secondary;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
    transition: transform 160ms ease;

    [aria-expanded='true'] & {
        transform: rotate(180deg);
    }
}

.list {
    position: absolute;
    top: calc(100% + $space-2);
    right: 0;
    z-index: 20;
    display: grid;
    width: max-content;
    min-width: 12rem;
    gap: $space-1;
    margin: 0;
    padding: $space-2;
    list-style: none;
    border-radius: $radius-md;
    backdrop-filter: blur(24px) saturate(130%);
}

.option.has-separator {
    padding-top: $space-2;
    margin-top: $space-1;
    border-top: 1px solid $color-ink-alpha-12;
}

.item {
    display: grid;
    grid-template-columns: 0.625rem minmax(0, 1fr);
    gap: $space-3;
    align-items: center;
    width: 100%;
    padding: $space-2 $space-3;
    color: $color-ink-secondary;
    font: inherit;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: $radius-sm;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        background: $color-signal-alpha-13;
        outline: none;
    }

    &-success {
        color: lighten-color($color-green-600, 35%);
    }

    &-muted {
        color: $color-ink-muted;
    }
}

.marker {
    width: 0.5rem;
    height: 0.5rem;
    background: $color-ink-muted;
    border-radius: $radius-full;

    .item-priority-high & {
        background: lighten-color($color-red-600, 25%);
        box-shadow: 0 0 0 3px $color-red-600-alpha-14;
    }

    .item-priority-medium & {
        background: $color-amber-500;
        box-shadow: 0 0 0 3px $color-amber-500-alpha-12;
    }

    .item-quick & {
        background: $color-signal-light;
        box-shadow: 0 0 0 3px $color-signal-alpha-14;
    }

    .item-success & {
        background: lighten-color($color-green-600, 25%);
        box-shadow: 0 0 0 3px $color-green-600-alpha-16;
    }

    .item-muted & {
        background: transparent;
        border: 1px solid $color-ink-muted;
    }
}
</style>
