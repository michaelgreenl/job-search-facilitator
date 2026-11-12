<script setup lang="ts">
import { MAX_JOB_POST_NOTES_LENGTH, type JobPost } from '@job-search-facilitator/core'
import { computed, shallowRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import SaveIcon from '@/components/svgs/SaveIcon.vue'
import { usePostStore } from '@/stores/post'

const props = defineProps<{
    active: boolean
    adjacent: boolean
    post: JobPost
}>()

const emit = defineEmits<{
    back: []
}>()

const postStore = usePostStore()
const draft = shallowRef(props.post.notes)
const saving = shallowRef(false)
const error = shallowRef<string | null>(null)
const dirty = computed(() => draft.value !== props.post.notes)

async function save() {
    if (!dirty.value || saving.value) {
        return
    }

    saving.value = true
    error.value = null

    try {
        await postStore.updatePost(props.post.id, { notes: draft.value })
    } catch (requestError) {
        error.value = requestError instanceof Error ? requestError.message : 'Could not save notes'
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <BasePanel
        as="aside"
        :active="active"
        :adjacent="adjacent"
        eyebrow="Notes"
        :title="post.company"
        back-label="Back to job post"
        back-test-id="back-from-job-post-notes"
        back-mobile-only
        @back="emit('back')"
    >
        <template #heading-controls>
            <BaseButton
                preset="icon"
                tooltip="Save changes"
                data-testid="save-job-post-notes"
                aria-label="Save changes"
                :aria-busy="saving || undefined"
                :disabled="!dirty || saving"
                @click="save"
            >
                <SaveIcon class="panel-control-icon" />
            </BaseButton>
        </template>

        <textarea
            v-model="draft"
            class="notes-textarea"
            data-testid="job-post-notes"
            :aria-label="`Notes for ${post.company}`"
            :maxlength="MAX_JOB_POST_NOTES_LENGTH"
            placeholder="Add notes"
            @keydown.meta.s.prevent="save"
            @keydown.ctrl.s.prevent="save"
        ></textarea>
        <p v-if="error" class="notes-error" data-testid="job-post-notes-error" role="alert">
            {{ error }}
        </p>
    </BasePanel>
</template>

<style scoped lang="scss">
.panel-control-icon {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;
}

.notes-textarea {
    flex: 1;
    width: 100%;
    min-height: 8rem;
    padding: $space-3;
    color: $color-ink;
    font: inherit;
    line-height: 1.55;
    background: $color-ink-alpha-6;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-md;
    resize: none;

    &:focus {
        border-color: $color-signal;
    }
}

.notes-error {
    margin: 0;
    color: lighten-color($color-red-600, 25%);
    font-size: 0.8125rem;
}
</style>
