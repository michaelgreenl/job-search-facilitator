<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

defineProps<{
    disabled: boolean
    testId?: string
}>()

const emit = defineEmits<{
    click: []
}>()
</script>

<template>
    <BaseButton
        class="discover-contact-button"
        icon-size="md"
        preset="primary"
        tooltip="Find new"
        :data-testid="testId"
        aria-label="Discover another contact"
        :disabled="disabled"
        @click="emit('click')"
    >
        <span class="discover-contact-icon" aria-hidden="true">+</span>
    </BaseButton>
</template>

<style scoped lang="scss">
.discover-contact-button {
    width: fit-content;
}

.discover-contact-icon {
    font-size: 1.25rem;
}
</style>
