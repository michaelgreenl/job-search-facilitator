<script setup lang="ts">
import type { AgentProvider, AgentSettings, AgentSettingsState } from '@job-search-facilitator/core'
import { computed, onMounted, shallowRef } from 'vue'
import AgentModelSelect from '@/components/agent/AgentModelSelect.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import ClaudeIcon from '@/components/svgs/ClaudeIcon.vue'
import OpenAiIcon from '@/components/svgs/OpenAiIcon.vue'
import { fetchAgentSettings, saveAgentSettings } from '@/services/agent/agent-bridge'

const providerDetails = {
    codex: { name: 'Codex', icon: OpenAiIcon },
    claude: { name: 'Claude', icon: ClaudeIcon },
} satisfies Record<AgentProvider, unknown>

const state = shallowRef<AgentSettingsState | null>(null)
const loading = shallowRef(true)
const loadError = shallowRef('')
const saveError = shallowRef('')
const message = shallowRef('')
const saving = shallowRef(false)
const selected = computed(() =>
    state.value?.providers.find(({ id }) => id === state.value?.settings.provider),
)
const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'The request failed. Try again.'

async function load() {
    loading.value = true
    loadError.value = ''
    saveError.value = ''
    try {
        state.value = await fetchAgentSettings()
    } catch (error) {
        loadError.value = errorMessage(error)
    } finally {
        loading.value = false
    }
}

async function save(settings: AgentSettings) {
    if (saving.value) return
    saving.value = true
    saveError.value = ''
    message.value = ''
    try {
        state.value = await saveAgentSettings(settings)
        message.value = 'Agent settings saved.'
    } catch (error) {
        saveError.value = errorMessage(error)
    } finally {
        saving.value = false
    }
}

onMounted(load)
</script>

<template>
    <header class="section-heading">
        <h2 id="agent-heading">Agent</h2>
    </header>
    <section class="settings-section" aria-labelledby="agent-heading" data-testid="agent-settings">
        <p v-if="loading" class="section-message muted" role="status">Loading agent settings…</p>
        <div v-else-if="loadError || !state" class="load-error">
            <p role="alert">{{ loadError }}</p>
            <p class="muted">Keep the Agent bridge running to change agent settings.</p>
            <BaseButton preset="secondary" data-testid="retry-agent-settings" @click="load"
                >Try again</BaseButton
            >
        </div>
        <div v-else class="agent-form" :aria-busy="saving">
            <fieldset :disabled="saving">
                <legend>Provider</legend>
                <p class="muted hint">New agent tasks run with this provider and model.</p>
                <div class="providers">
                    <label
                        v-for="provider in state.providers"
                        :key="provider.id"
                        class="provider"
                        :class="{
                            selected: provider.id === state.settings.provider,
                            unavailable: !provider.available,
                        }"
                    >
                        <input
                            type="radio"
                            name="agent-provider"
                            :value="provider.id"
                            :checked="provider.id === state.settings.provider"
                            :disabled="!provider.available"
                            :data-testid="`agent-provider-${provider.id}`"
                            @change="save({ ...state.settings, provider: provider.id })"
                        />
                        <component :is="providerDetails[provider.id].icon" class="provider-icon" />
                        <span class="provider-name">{{ providerDetails[provider.id].name }}</span>
                        <span class="provider-state">{{
                            provider.available ? 'Ready' : 'Unavailable'
                        }}</span>
                    </label>
                </div>
                <template v-for="provider in state.providers" :key="provider.id">
                    <p
                        v-if="provider.error"
                        class="provider-error muted"
                        :data-testid="`agent-provider-error-${provider.id}`"
                    >
                        {{ providerDetails[provider.id].name }}: {{ provider.error }}
                    </p>
                </template>
            </fieldset>
            <AgentModelSelect
                v-if="selected"
                class="model-select"
                :models="selected.models"
                :selection="state.settings.models[selected.id]"
                :disabled="saving"
                test-id="agent"
                @change="
                    save({
                        ...state.settings,
                        models: { ...state.settings.models, [selected.id]: $event },
                    })
                "
            />
        </div>
    </section>
    <p v-if="saveError" role="alert" class="save-error">{{ saveError }}</p>
    <p role="status" class="save-status" data-testid="agent-save-status">{{ message }}</p>
</template>

<style scoped lang="scss">
.section-heading {
    margin-top: $space-6;
    padding-top: $space-6;
    padding-bottom: $space-3;
    border-top: 1px solid $color-ink-alpha-12;
}

h2 {
    margin: 0;
    color: $color-signal-light;
    font-family: $font-family-mono;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.settings-section {
    padding: $space-1 $space-4;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;
}

.agent-form {
    display: grid;
    gap: $space-5;
    padding: $space-5 $space-2;
}

fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

legend {
    padding: 0;
    font-size: 0.875rem;
    font-weight: 600;
}

.muted {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.hint {
    margin: $space-1 0 $space-3;
}

.providers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $space-3;
}

.provider {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: $space-3;
    align-items: center;
    min-height: 3.5rem;
    padding: $space-3 $space-4;
    color: $color-ink-secondary;
    background: $color-ink-alpha-5;
    border: 1px solid $color-ink-alpha-12;
    border-radius: $radius-md;
    cursor: pointer;
    transition:
        color 140ms ease,
        background-color 140ms ease,
        border-color 140ms ease;

    &:has(:focus-visible) {
        outline: 2px solid $color-signal-light;
        outline-offset: 2px;
    }

    &:hover:not(.unavailable) {
        color: $color-ink;
        border-color: $color-signal-light-alpha-50;
    }

    &.selected {
        color: $color-ink;
        background: $color-signal-alpha-14;
        border-color: $color-signal-light;
    }

    &.unavailable {
        cursor: not-allowed;
        opacity: 0.55;
    }
}

.provider input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
}

.provider-icon {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentcolor;
}

.provider-name {
    font-weight: 600;
}

.provider-state {
    font-size: 0.75rem;

    .selected & {
        color: $color-signal-light;
    }
}

.provider-error {
    margin-top: $space-3;
    overflow-wrap: anywhere;
}

fieldset:disabled {
    opacity: 0.55;
}

.section-message,
.load-error {
    padding: $space-4 0;
}

.load-error {
    display: grid;
    justify-items: start;
    gap: $space-3;
}

.save-error {
    margin-top: $space-3;
    color: lighten-color($color-red-600, 20%);
}

.save-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

@media (width <= 30rem) {
    .providers {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
