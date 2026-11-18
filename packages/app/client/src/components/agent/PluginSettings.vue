<script setup lang="ts">
import {
    AGENT_PLUGIN_KINDS,
    type AgentPlugin,
    type AgentPluginKind,
    type AgentPluginStatus,
} from '@job-search-facilitator/core'
import { computed, onMounted, shallowRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseHint from '@/components/base/BaseHint.vue'
import BaseSwitch from '@/components/base/BaseSwitch.vue'
import ClaudeIcon from '@/components/svgs/ClaudeIcon.vue'
import InfoIcon from '@/components/svgs/InfoIcon.vue'
import OpenAiIcon from '@/components/svgs/OpenAiIcon.vue'
import RefreshIcon from '@/components/svgs/RefreshIcon.vue'
import {
    fetchAgentPlugins,
    refreshAgentPlugins,
    setAgentPluginEnabled,
} from '@/services/agent/agent-bridge'

/** `app` is the desktop app where the user installs and signs in to a plugin. */
const providers = {
    codex: { name: 'Codex', app: 'ChatGPT', icon: OpenAiIcon },
    claude: { name: 'Claude', app: 'Claude', icon: ClaudeIcon },
}
const kindNames: Record<AgentPluginKind, string> = {
    browser: 'Browser',
    documents: 'Documents',
    mail: 'Mail',
}
const statusNames: Record<AgentPluginStatus, string> = {
    ready: 'Ready',
    'needs-sign-in': 'Needs sign-in',
    'not-installed': 'Not installed',
    unavailable: 'Unavailable',
}

const plugins = shallowRef<AgentPlugin[]>([])
const loading = shallowRef(true)
const refreshing = shallowRef(false)
const loadError = shallowRef('')
const saveError = shallowRef('')
const message = shallowRef('')
const saving = shallowRef<string | null>(null)
const groups = computed(() =>
    AGENT_PLUGIN_KINDS.map((kind) => ({
        kind,
        plugins: plugins.value.filter((plugin) => plugin.kind === kind),
    })).filter((group) => group.plugins.length > 0),
)
const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'The request failed. Try again.'

/** Tells the user where to make a plugin ready. A ready plugin needs no hint. */
function hint({ provider, kind, status }: AgentPlugin) {
    const { app } = providers[provider]
    if (status === 'not-installed') return `Install it in ${app}.`
    if (status === 'needs-sign-in') return `Sign in to it in ${app}.`
    if (status === 'unavailable') {
        return provider === 'claude' && kind === 'browser'
            ? 'Check the Claude extension in Chrome.'
            : `Check it in ${app}.`
    }
    return ''
}

async function load() {
    loading.value = true
    loadError.value = ''
    saveError.value = ''
    try {
        plugins.value = await fetchAgentPlugins()
    } catch (error) {
        loadError.value = errorMessage(error)
    } finally {
        loading.value = false
    }
}

/** Asks each provider for its plugin states again. The list stays visible meanwhile. */
async function refresh() {
    if (refreshing.value) return
    refreshing.value = true
    saveError.value = ''
    message.value = ''
    try {
        plugins.value = await refreshAgentPlugins()
        message.value = 'Plugin states updated.'
    } catch (error) {
        saveError.value = errorMessage(error)
    } finally {
        refreshing.value = false
    }
}

async function toggle(plugin: AgentPlugin, enabled: boolean) {
    if (saving.value) return
    saving.value = plugin.id
    saveError.value = ''
    message.value = ''
    try {
        const saved = await setAgentPluginEnabled(plugin.id, enabled)
        plugins.value = plugins.value.map((item) => (item.id === saved.id ? saved : item))
        message.value = `${saved.name} for ${providers[saved.provider].name} turned ${saved.enabled ? 'on' : 'off'}.`
    } catch (error) {
        saveError.value = errorMessage(error)
    } finally {
        saving.value = null
    }
}

onMounted(load)
</script>

<template>
    <header class="section-heading">
        <div class="heading-title">
            <h2 id="plugins-heading">Plugins</h2>
            <BaseHint
                class="heading-hint"
                text="Agents that this app starts use only the plugins that are on."
                aria-label="About plugins"
            >
                <InfoIcon class="action-icon" />
            </BaseHint>
        </div>
        <BaseButton
            preset="text"
            class="refresh-button"
            :disabled="loading || refreshing || saving !== null"
            data-testid="refresh-plugins"
            @click="refresh"
        >
            Refresh
            <RefreshIcon class="action-icon" />
        </BaseButton>
    </header>
    <section
        class="settings-section"
        aria-labelledby="plugins-heading"
        data-testid="plugin-settings"
    >
        <p v-if="loading" class="section-message muted" role="status">Loading plugins…</p>
        <div v-else-if="loadError" class="load-error">
            <p role="alert">{{ loadError }}</p>
            <p class="muted">Keep the Agent bridge running to change plugins.</p>
            <BaseButton preset="secondary" data-testid="retry-plugins" @click="load"
                >Try again</BaseButton
            >
        </div>
        <p v-else-if="!groups.length" class="section-message muted">No plugins are available.</p>
        <div v-else class="plugin-groups" :aria-busy="refreshing || saving !== null">
            <section
                v-for="group in groups"
                :key="group.kind"
                class="plugin-group"
                :aria-labelledby="`plugin-kind-${group.kind}`"
            >
                <h3 :id="`plugin-kind-${group.kind}`">{{ kindNames[group.kind] }}</h3>
                <ul class="plugin-list">
                    <li
                        v-for="plugin in group.plugins"
                        :key="plugin.id"
                        class="plugin-row"
                        :data-testid="`plugin-${plugin.id}`"
                    >
                        <component
                            :is="providers[plugin.provider].icon"
                            class="provider-icon"
                            aria-hidden="true"
                        />
                        <div class="plugin-heading">
                            <strong>{{ plugin.name }}</strong>
                            <span class="plugin-meta">
                                <span class="plugin-provider">{{
                                    providers[plugin.provider].name
                                }}</span>
                                <BaseHint
                                    v-if="hint(plugin)"
                                    class="status"
                                    :text="hint(plugin)"
                                    :data-testid="`plugin-status-${plugin.id}`"
                                    :data-status="plugin.status"
                                    >{{ statusNames[plugin.status] }}</BaseHint
                                >
                                <span
                                    v-else
                                    class="status"
                                    :data-testid="`plugin-status-${plugin.id}`"
                                    :data-status="plugin.status"
                                    >{{ statusNames[plugin.status] }}</span
                                >
                            </span>
                        </div>
                        <div class="plugin-switch">
                            <span class="switch-state" aria-hidden="true">{{
                                plugin.enabled ? 'On' : 'Off'
                            }}</span>
                            <BaseSwitch
                                :checked="plugin.enabled"
                                :disabled="saving !== null || plugin.status === 'not-installed'"
                                :accessible-label="`${plugin.name} for ${providers[plugin.provider].name}`"
                                :test-id="`plugin-switch-${plugin.id}`"
                                @toggle="toggle(plugin, $event)"
                            />
                        </div>
                    </li>
                </ul>
            </section>
        </div>
    </section>
    <p v-if="saveError" role="alert" class="save-error">{{ saveError }}</p>
    <p role="status" class="save-status" data-testid="plugin-save-status">{{ message }}</p>
</template>

<style scoped lang="scss">
.section-heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: $space-2;
    justify-content: space-between;
    margin-top: $space-6;
    padding-top: $space-6;
    padding-bottom: $space-3;
    border-top: 1px solid $color-ink-alpha-12;
}

.heading-title {
    display: flex;
    gap: $space-1;
    align-items: center;
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

.heading-hint {
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    color: $color-ink-muted;
    border-radius: $radius-full;
    transition: color 140ms ease;

    &:hover,
    &:focus-visible {
        color: $color-signal-light;
    }
}

.refresh-button {
    align-items: center;
    gap: $space-2;

    .section-heading &:active:not(:disabled) {
        transform: none;
    }
}

.action-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;
    transition: transform 500ms ease;

    .refresh-button:active:not(:disabled) & {
        transform: rotate(-360deg);
        transition: none;
    }
}

.settings-section {
    padding: $space-1 $space-4;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;
}

.plugin-groups {
    display: grid;
    gap: $space-5;
    padding: $space-5 $space-2;
}

.plugin-group {
    display: grid;
    gap: $space-2;
}

h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
}

.plugin-list {
    padding: 0;
    margin: 0;
    list-style: none;
}

.plugin-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: $space-3;
    align-items: center;
    min-height: 3.25rem;
    padding: $space-3 0;
}

.plugin-row + .plugin-row {
    border-top: 1px solid $color-ink-alpha-9;
}

.provider-icon {
    width: 1.125rem;
    height: 1.125rem;
    color: $color-ink-secondary;
    fill: currentcolor;
}

.plugin-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: $space-2;
    min-width: 0;
    overflow-wrap: anywhere;
}

.plugin-heading strong {
    font-weight: 600;
}

.plugin-meta {
    display: inline-flex;
    align-items: baseline;
    gap: $space-2;
}

.plugin-provider,
.switch-state,
.muted {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.status {
    padding: $space-1 $space-2;
    color: $color-ink-secondary;
    font-size: 0.75rem;
    white-space: nowrap;
    background: $color-ink-alpha-9;
    border-radius: $radius-full;
}

.status[data-status='ready'] {
    color: $color-signal-light;
    background: $color-signal-alpha-14;
}

// A state with a hint is a control. It shows where to make the plugin ready.
button.status {
    transition:
        color 140ms ease,
        background-color 140ms ease;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        background: $color-ink-alpha-16;
    }
}

.plugin-switch {
    display: flex;
    gap: $space-3;
    align-items: center;
}

.switch-state {
    min-width: 1.75rem;
    text-align: right;

    // The text dims together with a switch that the user cannot change.
    .plugin-switch:has(:disabled) & {
        opacity: 0.5;
    }
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

// On a narrow screen, each row shows the name first, then the provider and state.
@media (width <= 30rem) {
    .plugin-heading {
        flex-direction: column;
        gap: $space-1;
    }
}

@media (prefers-reduced-motion: reduce) {
    .action-icon {
        transition: none;
    }
}
</style>
