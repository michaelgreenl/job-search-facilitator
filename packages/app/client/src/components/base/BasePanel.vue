<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import ArrowLeftIcon from '@/components/svgs/ArrowLeftIcon.vue'

interface Props {
    as?: 'section' | 'aside'
    active: boolean
    adjacent: boolean
    eyebrow?: string
    title?: string
    titleTag?: 'h1' | 'h2'
    backLabel?: string
    backTestId?: string
    backMobileOnly?: boolean
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<Props>(), {
    as: 'section',
    titleTag: 'h2',
})

const emit = defineEmits<{
    back: []
}>()
</script>

<template>
    <component
        :is="props.as"
        v-bind="$attrs"
        class="base-panel"
        :data-active="props.active"
        :class="{
            'is-active': props.active,
            'is-adjacent': props.adjacent,
        }"
    >
        <div
            v-if="props.backLabel || $slots.controls"
            class="panel-controls"
            :class="{
                'panel-controls-mobile-only': props.backMobileOnly && !$slots.controls,
            }"
        >
            <BaseButton
                v-if="props.backLabel"
                preset="back"
                :tooltip="props.backLabel"
                :data-testid="props.backTestId"
                :aria-label="props.backLabel"
                :class="{ 'panel-back-mobile-only': props.backMobileOnly }"
                @click="emit('back')"
            >
                <ArrowLeftIcon />
            </BaseButton>

            <slot name="controls" />
        </div>

        <header
            v-if="props.eyebrow !== undefined || props.title !== undefined"
            class="panel-heading"
            data-testid="panel-heading"
        >
            <div class="panel-title">
                <span v-if="props.eyebrow" class="eyebrow">{{ props.eyebrow }}</span>
                <component v-if="props.title !== undefined" :is="props.titleTag" class="heading">
                    {{ props.title }}
                </component>
            </div>

            <div v-if="$slots['heading-controls']" class="panel-heading-controls">
                <slot name="heading-controls" />
            </div>
        </header>

        <slot />
    </component>
</template>

<style scoped lang="scss">
.base-panel {
    display: none;
    flex: 1;
    flex-direction: column;
    gap: $space-4;
    min-height: 24rem;
    max-height: 96dvh;
    padding: $space-5 $space-5 0;
    border-radius: $radius-lg;

    &.is-active {
        display: flex;
    }

    @include bp-md-tablet {
        min-height: 38rem;

        &.is-adjacent {
            display: flex;
            min-width: 24rem;
        }
    }
}

.panel-heading {
    display: flex;
    flex-wrap: wrap;
    gap: $space-4;
    align-items: end;
    justify-content: space-between;
}

.panel-controls {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
}

.panel-controls-mobile-only {
    @include bp-md-tablet {
        display: none;
    }
}

.panel-back-mobile-only {
    @include bp-md-tablet {
        display: none;
    }
}

.panel-title {
    display: grid;
    gap: $space-1;
}

.eyebrow {
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.13em;
    text-transform: uppercase;
}

.heading {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.1;
    text-wrap: balance;
}

.panel-heading-controls {
    display: flex;
    flex-flow: column wrap;
    gap: $space-1;
    align-items: end;
}
</style>
