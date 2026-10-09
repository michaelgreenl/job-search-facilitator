<script setup lang="ts">
import {
    AUTOMATION_DAYS,
    MAX_AUTOMATION_TIMES,
    automationScheduleSchema,
    type Automation,
    type AutomationSchedule,
    type UpdateAutomation,
} from '@job-search-facilitator/core'
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePopUp from '@/components/base/BasePopUp.vue'
import PauseIcon from '@/components/svgs/PauseIcon.vue'
import PlayIcon from '@/components/svgs/PlayIcon.vue'
import RefreshIcon from '@/components/svgs/RefreshIcon.vue'
import { fetchAutomations, updateAutomation } from '@/services/agent/agent-bridge'

const automations = shallowRef<Automation[]>([])
const loading = shallowRef(true)
const loadError = shallowRef('')
const saveError = shallowRef('')
const message = shallowRef('')
const saving = shallowRef<string | null>(null)
const editing = shallowRef<Automation | null>(null)
const days = shallowRef<AutomationSchedule['days']>([])
const runTimes = ref<
    { key: number; hour: number | string; minute: number | string; period: string }[]
>([])
const hourInputs = useTemplateRef<HTMLInputElement[]>('hourInputs')
let nextTimeKey = 0
const times = computed(() =>
    runTimes.value.map(({ hour, minute, period }) => {
        if (!/^(0?[1-9]|1[0-2])$/.test(String(hour)) || !/^[0-5]?\d$/.test(String(minute)))
            return ''
        const hours = (Number(hour) % 12) + (period === 'PM' ? 12 : 0)
        return `${String(hours).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }),
)
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const presets: { id: string; label: string; days: AutomationSchedule['days'] }[] = [
    { id: 'daily', label: 'Daily', days: [...AUTOMATION_DAYS] },
    { id: 'weekdays', label: 'Weekdays', days: ['MO', 'TU', 'WE', 'TH', 'FR'] },
    { id: 'weekends', label: 'Weekends', days: ['SA', 'SU'] },
    { id: 'weekly', label: 'Weekly', days: ['MO'] },
]
const selectedPreset = computed(() =>
    days.value.length === 1
        ? 'weekly'
        : presets.find(
              (preset) =>
                  preset.days.length === days.value.length &&
                  preset.days.every((day) => days.value.includes(day)),
          )?.id,
)
const changed = computed(
    () =>
        editing.value?.schedule &&
        ([...times.value].sort().join(',') !== editing.value.schedule.times.join(',') ||
            AUTOMATION_DAYS.some(
                (day) => days.value.includes(day) !== editing.value!.schedule!.days.includes(day),
            )),
)
const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'The request failed. Try again.'

function scheduleLabel(automation: Automation) {
    if (!automation.schedule) return 'Custom schedule · edit in the desktop app'
    const { days, times } = automation.schedule
    const dayLabel =
        days.length === 7
            ? 'Every day'
            : days.length === 5 && AUTOMATION_DAYS.slice(0, 5).every((day) => days.includes(day))
              ? 'Weekdays'
              : days.length === 2 && days.includes('SA') && days.includes('SU')
                ? 'Weekends'
                : AUTOMATION_DAYS.flatMap((day, index) =>
                      days.includes(day) ? [dayNames[index]!.slice(0, 3)] : [],
                  ).join(', ')
    const format = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    const clocks = times.map((time) => {
        const [hour, minute] = time.split(':').map(Number)
        return format.format(new Date(2000, 0, 1, hour, minute))
    })
    return `${dayLabel} at ${clocks.join(' · ')}`
}

function nextLabel(automation: Automation) {
    if (!automation.nextScheduledAt) return 'See the desktop app for the next run'
    return `Next scheduled: ${new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: automation.timeZone,
    }).format(new Date(automation.nextScheduledAt))}`
}

async function load() {
    loading.value = true
    loadError.value = ''
    saveError.value = ''
    try {
        automations.value = await fetchAutomations()
    } catch (error) {
        loadError.value = errorMessage(error)
    } finally {
        loading.value = false
    }
}

function timeDraft(time: string) {
    const [hours, minutes] = time.split(':')
    return {
        key: nextTimeKey++,
        hour: hours ? String(Number(hours) % 12 || 12).padStart(2, '0') : '',
        minute: minutes ?? '00',
        period: Number(hours) >= 12 ? 'PM' : 'AM',
    }
}

async function focusTime(key: number) {
    await nextTick()
    hourInputs.value?.find((input) => input.dataset.timeKey === String(key))?.focus()
}

function addTime() {
    const time = timeDraft('')
    runTimes.value.push(time)
    void focusTime(time.key)
}

function removeTime(index: number) {
    const target = runTimes.value[index + 1] ?? runTimes.value[index - 1]
    runTimes.value.splice(index, 1)
    if (target) void focusTime(target.key)
}

function edit(automation: Automation) {
    if (!automation.schedule) return
    editing.value = automation
    days.value = [...automation.schedule.days]
    runTimes.value = automation.schedule.times.map(timeDraft)
    saveError.value = ''
    message.value = ''
}

async function save(automation: Automation, changes: Omit<UpdateAutomation, 'revision'>) {
    if (saving.value) return
    saving.value = automation.id
    saveError.value = ''
    message.value = ''
    try {
        const saved = await updateAutomation(automation.id, {
            ...changes,
            revision: automation.revision,
        })
        automations.value = automations.value.map((item) => (item.id === saved.id ? saved : item))
        editing.value = null
        message.value = changes.schedule
            ? `Schedule saved for ${saved.name}.`
            : `${saved.name} ${saved.status === 'PAUSED' ? 'paused' : 'resumed'}.`
    } catch (error) {
        saveError.value = errorMessage(error)
    } finally {
        saving.value = null
    }
}

function saveSchedule() {
    if (!editing.value) return
    const schedule = automationScheduleSchema.safeParse({ days: days.value, times: times.value })
    if (!schedule.success) {
        saveError.value = 'Choose at least one day and valid, unique run times.'
        return
    }
    void save(editing.value, { schedule: schedule.data })
}

onMounted(load)
</script>

<template>
    <section
        class="automations"
        aria-labelledby="automations-heading"
        data-testid="automation-settings"
    >
        <header class="section-heading">
            <h2 id="automations-heading">Automations</h2>
            <BaseButton
                preset="text"
                class="refresh-button"
                :disabled="loading || saving !== null"
                data-testid="refresh-automations"
                @click="load"
            >
                Refresh
                <RefreshIcon class="action-icon" />
            </BaseButton>
        </header>
        <div class="settings-section">
            <p v-if="loading" class="section-message muted" role="status">Loading automations…</p>
            <div v-else-if="loadError" class="load-error">
                <p role="alert">{{ loadError }}</p>
                <p class="muted">Keep the Agent bridge running to manage local schedules.</p>
                <BaseButton preset="secondary" data-testid="retry-automations" @click="load"
                    >Try again</BaseButton
                >
            </div>
            <p v-else-if="!automations.length" class="section-message muted">
                No local automations for this project. Create a schedule in the desktop app to get
                started.
            </p>
            <ul v-else class="automation-list">
                <li
                    v-for="automation in automations"
                    :key="automation.id"
                    class="automation-row"
                    :data-testid="`automation-${automation.id}`"
                    :aria-busy="saving === automation.id"
                >
                    <div class="automation-details">
                        <div class="automation-heading">
                            <strong>{{ automation.name }}</strong>
                            <span
                                class="status"
                                :class="{ active: automation.status === 'ACTIVE' }"
                                :data-testid="`status-${automation.id}`"
                                >{{ automation.status === 'ACTIVE' ? 'Active' : 'Paused' }}</span
                            >
                        </div>
                        <p class="schedule-summary" :data-testid="`schedule-${automation.id}`">
                            {{ scheduleLabel(automation) }}
                        </p>
                        <p
                            v-if="automation.status === 'ACTIVE'"
                            class="muted"
                            :data-testid="`next-${automation.id}`"
                        >
                            {{ nextLabel(automation) }}
                        </p>
                    </div>
                    <div class="automation-actions">
                        <BaseButton
                            preset="secondary"
                            :disabled="saving !== null"
                            :aria-label="`${automation.status === 'ACTIVE' ? 'Pause' : 'Resume'} ${automation.name}`"
                            :data-testid="`toggle-${automation.id}`"
                            @click="
                                save(automation, {
                                    status: automation.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                                })
                            "
                        >
                            <PlayIcon v-if="automation.status === 'PAUSED'" class="action-icon" />
                            <PauseIcon v-else class="action-icon" />
                            {{
                                saving === automation.id
                                    ? 'Saving…'
                                    : automation.status === 'ACTIVE'
                                      ? 'Pause'
                                      : 'Resume'
                            }}
                        </BaseButton>
                        <BaseButton
                            preset="primary"
                            class="edit-schedule"
                            :disabled="saving !== null || !automation.schedule"
                            :aria-label="`Edit schedule for ${automation.name}`"
                            :data-testid="`edit-${automation.id}`"
                            @click="edit(automation)"
                            >Edit schedule</BaseButton
                        >
                    </div>
                </li>
            </ul>
        </div>
        <p v-if="saveError && !editing" role="alert" class="save-error">{{ saveError }}</p>
        <p role="status" class="save-status" data-testid="automation-save-status">{{ message }}</p>
    </section>

    <BasePopUp
        :open="editing !== null"
        heading="Edit schedule"
        eyebrow="Job search automation"
        :error="saveError"
        class="schedule-dialog"
        data-testid="automation-schedule-dialog"
        @close="!saving && (editing = null)"
    >
        <form class="schedule-form" :aria-busy="saving !== null" @submit.prevent="saveSchedule">
            <div class="schedule-section">
                <fieldset :disabled="saving !== null">
                    <legend>Repeat</legend>
                    <div class="presets">
                        <BaseButton
                            v-for="preset in presets"
                            :key="preset.id"
                            preset="secondary"
                            :aria-pressed="selectedPreset === preset.id"
                            :data-testid="`preset-${preset.id}`"
                            @click="
                                days = preset.id === 'weekly' ? [days[0] ?? 'MO'] : [...preset.days]
                            "
                            >{{ preset.label }}</BaseButton
                        >
                    </div>
                </fieldset>
                <fieldset class="days-fieldset" :disabled="saving !== null">
                    <legend>Run on</legend>
                    <div class="days">
                        <label
                            v-for="(day, index) in AUTOMATION_DAYS"
                            :key="day"
                            class="day"
                            :class="{ selected: days.includes(day) }"
                        >
                            <input
                                v-model="days"
                                type="checkbox"
                                :value="day"
                                :aria-label="dayNames[index]"
                                :data-testid="`day-${day}`"
                            />
                            <span aria-hidden="true">{{ dayNames[index]!.slice(0, 3) }}</span>
                            <span class="day-check" aria-hidden="true">{{
                                days.includes(day) ? '✓' : ''
                            }}</span>
                        </label>
                    </div>
                </fieldset>
            </div>
            <div class="schedule-section">
                <fieldset :disabled="saving !== null">
                    <legend class="time-heading">
                        <span>Run at</span>
                        <span class="time-zone"
                            >* {{ editing?.timeZone.replaceAll('_', ' ') }}</span
                        >
                    </legend>
                    <div class="time-list">
                        <div
                            v-for="(run, index) in runTimes"
                            :key="run.key"
                            class="time-row"
                            role="group"
                            :aria-label="`Run time ${index + 1}`"
                            :data-testid="`automation-time-${index}`"
                        >
                            <div class="time-entry">
                                <div class="time-digits">
                                    <input
                                        ref="hourInputs"
                                        v-model="run.hour"
                                        :data-time-key="run.key"
                                        type="number"
                                        inputmode="numeric"
                                        min="1"
                                        max="12"
                                        required
                                        aria-label="Hour"
                                        data-testid="automation-hour"
                                        @focus="($event.target as HTMLInputElement).select()"
                                        @blur="
                                            run.hour !== '' &&
                                            (run.hour = String(run.hour).padStart(2, '0'))
                                        "
                                    />
                                    <span class="time-colon" aria-hidden="true">:</span>
                                    <input
                                        v-model="run.minute"
                                        type="number"
                                        inputmode="numeric"
                                        min="0"
                                        max="59"
                                        required
                                        aria-label="Minute"
                                        data-testid="automation-minute"
                                        @focus="($event.target as HTMLInputElement).select()"
                                        @blur="
                                            run.minute !== '' &&
                                            (run.minute = String(run.minute).padStart(2, '0'))
                                        "
                                    />
                                </div>
                                <div class="time-period">
                                    <label
                                        v-for="value in ['AM', 'PM']"
                                        :key="value"
                                        :class="{ selected: run.period === value }"
                                    >
                                        <input
                                            v-model="run.period"
                                            type="radio"
                                            :name="`automation-period-${run.key}`"
                                            :value="value"
                                            :data-testid="`automation-${value.toLowerCase()}`"
                                        />
                                        <span>{{ value }}</span>
                                    </label>
                                </div>
                            </div>
                            <BaseButton
                                v-if="runTimes.length > 1"
                                preset="icon"
                                icon-size="md"
                                class="remove-time"
                                :aria-label="`Remove run time ${index + 1}`"
                                :data-testid="`remove-time-${index}`"
                                @click="removeTime(index)"
                                ><span aria-hidden="true">×</span></BaseButton
                            >
                        </div>
                    </div>
                    <BaseButton
                        preset="primary"
                        icon-size="md"
                        tooltip="Add time"
                        aria-label="Add time"
                        class="add-time"
                        data-testid="add-automation-time"
                        :disabled="runTimes.length >= MAX_AUTOMATION_TIMES"
                        @click="addTime"
                        ><span aria-hidden="true">+</span></BaseButton
                    >
                    <p v-if="runTimes.length >= MAX_AUTOMATION_TIMES" class="muted">
                        Up to {{ MAX_AUTOMATION_TIMES }} run times per day.
                    </p>
                </fieldset>
            </div>
            <div class="form-actions">
                <BaseButton preset="secondary" :disabled="saving !== null" @click="editing = null"
                    >Cancel</BaseButton
                >
                <BaseButton
                    type="submit"
                    :disabled="saving !== null || !changed"
                    data-testid="save-automation-schedule"
                    >{{ saving ? 'Saving…' : 'Save schedule' }}</BaseButton
                >
            </div>
        </form>
    </BasePopUp>
</template>

<style scoped lang="scss">
.section-heading,
.automation-actions,
.form-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: $space-2;
}

.section-heading {
    justify-content: space-between;
    padding-bottom: $space-3;
}

.refresh-button {
    align-items: center;
    gap: $space-2;
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
}

.edit-schedule {
    margin-left: auto;
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

.automation-list {
    padding: 0;
    margin: 0;
    list-style: none;
}

.automation-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: $space-4;
    padding: $space-5 $space-2;
    align-items: center;
}

.automation-row + .automation-row {
    border-top: 1px solid $color-ink-alpha-9;
}

.automation-details {
    display: grid;
    gap: $space-2;
    min-width: 0;
    overflow-wrap: anywhere;
}

.automation-heading {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: $space-2;
}

.automation-heading strong {
    font-size: 1rem;
    font-weight: 600;
}

.status {
    padding: $space-1 $space-2;
    border-radius: $radius-full;
    background: $color-ink-alpha-9;
    color: $color-ink-secondary;
    font-size: 0.75rem;
    white-space: nowrap;
}

.status.active {
    color: $color-signal-light;
    background: $color-signal-alpha-14;
}

.muted {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.schedule-summary {
    color: $color-ink-secondary;
    font-size: 0.875rem;
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

.schedule-dialog {
    width: min(34rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: $space-5;
    overflow-y: auto;
    overflow-wrap: anywhere;
}

.schedule-section {
    padding: $space-5 0;
    border-top: 1px solid $color-ink-alpha-12;
}

fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

legend {
    padding: 0;
    margin-bottom: $space-3;
    font-size: 0.875rem;
    font-weight: 600;
}

.presets {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: $space-2;
}

.presets .base-button {
    min-height: 2.75rem;
    padding: $space-2 $space-1;
    font-size: 0.8125rem;
    border-color: $color-ink-alpha-16;

    &:hover {
        background: $color-ink-alpha-5;
        border-color: $color-signal-light-alpha-50;
    }

    &[aria-pressed='true'] {
        background: $color-signal-alpha-14;
        border-color: $color-signal-light;
        color: $color-signal-light;
    }
}

.days-fieldset {
    margin-top: $space-5;
}

.days-fieldset legend {
    color: $color-ink-secondary;
    font-size: 0.75rem;
    font-weight: 400;
}

.days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: clamp(0.25rem, 1vw, 0.5rem);
}

.day {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: $space-1;
    min-width: 0;
    min-height: 3.5rem;
    color: $color-ink-secondary;
    background: $color-ink-alpha-5;
    border: 1px solid transparent;
    border-radius: $radius-md;
    font-size: clamp(0.6875rem, 2.5vw, 0.875rem);
    cursor: pointer;
    white-space: nowrap;

    &:hover {
        border-color: $color-signal-light-alpha-50;
    }
}

.day.selected {
    color: $color-signal-light;
    background: $color-signal-alpha-14;
    border-color: $color-signal-light-alpha-28;
}

.day-check {
    height: 0.75rem;
    font-size: 0.75rem;
    line-height: 1;
}

.day input,
.time-period input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
}

.time-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: $space-3;
    width: 100%;
}

.time-zone {
    color: $color-ink-secondary;
    font-size: 0.75rem;
    font-weight: 400;
    text-align: right;
}

.time-entry {
    display: flex;
    align-items: center;
    gap: $space-3;
}

.time-list {
    display: grid;
    gap: $space-3;
}

.time-row {
    display: flex;
    align-items: center;
    gap: $space-2;
}

.remove-time {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 1.25rem;
}

.add-time {
    display: flex;
    margin: $space-3 0 0 auto;
    font-size: 1.25rem;
}

.time-digits {
    display: flex;
    align-items: center;
    padding: $space-1;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-28;
    border-radius: $radius-md;
}

.time-digits input {
    width: 3.5rem;
    height: 3rem;
    padding: 0;
    color: $color-ink;
    background: transparent;
    border: 0;
    border-radius: $radius-sm;
    font: inherit;
    font-size: 1.75rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
    appearance: textfield;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
        appearance: none;
        margin: 0;
    }
}

.time-colon {
    color: $color-ink-muted;
    font-size: 1.5rem;
}

.time-period {
    display: flex;
    padding: $space-1;
    border: 1px solid $color-ink-alpha-12;
    border-radius: $radius-md;
}

.time-period label {
    position: relative;
    display: grid;
    place-items: center;
    width: 2.75rem;
    min-height: 2.75rem;
    color: $color-ink-secondary;
    font-size: 0.8125rem;
    border-radius: $radius-sm;
    cursor: pointer;

    &:hover {
        color: $color-ink;
        background: $color-ink-alpha-5;
    }

    &.selected {
        color: $color-ink;
        background: $color-signal-alpha-24;
        box-shadow: inset 0 0 0 1px $color-signal-light-alpha-28;
    }
}

fieldset:disabled {
    opacity: 0.55;
}

.day:has(:focus-visible),
.time-period label:has(:focus-visible),
.time-digits input:focus-visible {
    outline: 2px solid $color-signal-light;
    outline-offset: 2px;
}

.form-actions {
    justify-content: flex-end;
    padding-top: $space-4;
    border-top: 1px solid $color-ink-alpha-12;
}

@media (width <= 24rem) {
    .schedule-dialog {
        padding: $space-4;
    }

    .presets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .time-digits input {
        width: 2.5rem;
    }

    .time-period label {
        width: 2.25rem;
    }
}

@media (pointer: coarse) {
    .automation-actions .base-button,
    .form-actions .base-button {
        min-height: 2.75rem;
    }
}
</style>

<style lang="scss">
.schedule-dialog .pop-up-header {
    margin-bottom: $space-5;
}

.schedule-dialog .pop-up-eyebrow {
    margin-bottom: $space-2;
    font-size: 0.625rem;
    letter-spacing: 0.1em;
}

.schedule-dialog .pop-up-title {
    font-size: 1.5rem;
    line-height: 1.2;
}
</style>
