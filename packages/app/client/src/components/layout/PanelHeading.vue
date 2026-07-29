<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import ArrowLeftIcon from '@/components/svgs/ArrowLeftIcon.vue'

interface Props {
    eyebrow: string
    title: string
    titleTag?: 'h1' | 'h2'
    backLabel?: string
    backTestId?: string
}

const props = withDefaults(defineProps<Props>(), {
    titleTag: 'h2',
})

const emit = defineEmits<{
    back: []
}>()
</script>

<template>
    <header class="panel-heading">
        <div class="panel-title">
            <BaseButton
                v-if="props.backLabel"
                preset="back"
                :tooltip="props.backLabel"
                :data-testid="props.backTestId"
                :aria-label="props.backLabel"
                @click="emit('back')"
            >
                <ArrowLeftIcon />
            </BaseButton>

            <span class="eyebrow">{{ props.eyebrow }}</span>
            <component :is="props.titleTag" class="heading">
                {{ props.title }}
            </component>
        </div>

        <div v-if="$slots.controls" class="panel-controls">
            <slot name="controls" />
        </div>
    </header>
</template>

<style scoped lang="scss">
.panel-heading {
    display: flex;
    flex-wrap: wrap;
    gap: $space-4;
    align-items: end;
    justify-content: space-between;
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

.panel-controls {
    display: flex;
    flex-flow: column wrap;
    gap: $space-1;
    align-items: end;
}
</style>
