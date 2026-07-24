<script setup lang="ts">
interface Props {
    as?: 'section' | 'aside'
    active: boolean
    adjacent: boolean
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<Props>(), {
    as: 'section',
})
</script>

<template>
    <component
        :is="props.as"
        v-bind="$attrs"
        class="flow-panel"
        :class="{
            'is-active': props.active,
            'is-adjacent': props.adjacent,
        }"
    >
        <slot />
    </component>
</template>

<style scoped lang="scss">
.flow-panel {
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
</style>
