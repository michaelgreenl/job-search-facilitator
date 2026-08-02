<script lang="ts">
export type BaseCardElement = 'article' | 'button' | 'div'
export type BaseCardLayout = 'flex' | 'grid'
export type BaseCardTone = 'default' | 'signal'
</script>

<script setup lang="ts">
interface Props {
    as?: BaseCardElement
    interactive?: boolean
    layout?: BaseCardLayout
    selected?: boolean
    tone?: BaseCardTone
    type?: 'button' | 'reset' | 'submit'
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<Props>(), {
    as: 'article',
    interactive: false,
    layout: 'grid',
    selected: false,
    tone: 'default',
    type: 'button',
})
</script>

<template>
    <component
        :is="props.as"
        v-bind="$attrs"
        class="base-card"
        :class="{
            'layout-flex': props.layout === 'flex',
            'tone-signal': props.tone === 'signal',
            'is-interactive': props.interactive || props.as === 'button',
            'is-selected': props.selected,
        }"
        :type="props.as === 'button' ? props.type : undefined"
    >
        <slot />
    </component>
</template>

<style scoped lang="scss">
.base-card {
    box-sizing: border-box;
    display: grid;
    width: 100%;
    color: $color-ink;
    text-align: start;
    text-decoration: none;
    background: $color-ink-alpha-5;
    border: 1px solid $color-ink-alpha-9;
    border-radius: $radius-md;

    &.layout-flex {
        display: flex;
    }

    &.is-interactive {
        &:hover,
        &:focus-visible,
        &:focus-within {
            background: $color-signal-alpha-9;
            border-color: $color-signal-alpha-28;
        }
    }

    &.tone-signal {
        border-color: $color-signal-light-alpha-18;

        &.is-interactive {
            &:hover,
            &:focus-visible,
            &:focus-within {
                background: $color-ink-alpha-5;
                border-color: $color-signal-light-alpha-50;
            }
        }
    }

    &.is-selected {
        background: $color-signal-alpha-12;
        border-color: $color-signal;

        &.is-interactive {
            &:hover,
            &:focus-visible,
            &:focus-within {
                background: $color-signal-alpha-12;
                border-color: $color-signal;
            }
        }
    }
}

button.base-card {
    font: inherit;
    cursor: pointer;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
    }
}
</style>
