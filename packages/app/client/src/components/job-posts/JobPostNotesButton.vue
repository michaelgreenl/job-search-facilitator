<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import NoteIcon from '@/components/svgs/NoteIcon.vue'

defineProps<{
    open: boolean
}>()
</script>

<template>
    <BaseButton
        preset="icon"
        tooltip="Notes"
        data-testid="toggle-job-post-notes"
        aria-label="Notes"
        :aria-pressed="open"
    >
        <NoteIcon class="notes-icon" />
    </BaseButton>
</template>

<style scoped lang="scss">
.notes-icon {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;
}
</style>
