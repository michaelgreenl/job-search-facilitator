<script setup lang="ts">
import { MAX_APPLICATION_ARTIFACT_BYTES, type Resume } from '@job-search-facilitator/core'
import { onMounted, shallowRef, useTemplateRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePopUp from '@/components/base/BasePopUp.vue'
import AutomationSettings from '@/components/AutomationSettings.vue'
import DownloadIcon from '@/components/svgs/DownloadIcon.vue'
import OpenExternalIcon from '@/components/svgs/OpenExternalIcon.vue'
import UploadIcon from '@/components/svgs/UploadIcon.vue'
import { fetchResumes, resumeUploadUrl, uploadResume } from '@/services/resumes'

const resumes = shallowRef<Resume[]>([])
const loading = shallowRef(true)
const loadError = shallowRef('')
const uploadError = shallowRef('')
const saving = shallowRef(false)
const status = shallowRef('')
const uploadOpen = shallowRef(false)
const uploadTarget = shallowRef<Resume | null>(null)
const history = shallowRef<Resume | null>(null)
const name = shallowRef('')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const formatDate = (value: string) => dateFormat.format(new Date(value))
const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'The request failed. Try again.'

async function load() {
    loading.value = true
    loadError.value = ''
    try {
        resumes.value = await fetchResumes()
    } catch (error) {
        loadError.value = errorMessage(error)
    } finally {
        loading.value = false
    }
}

function openUpload(resume: Resume | null) {
    uploadTarget.value = resume
    name.value = resume?.name ?? ''
    uploadError.value = ''
    status.value = ''
    if (fileInput.value) fileInput.value.value = ''
    uploadOpen.value = true
}

async function save() {
    if (saving.value) return
    const file = fileInput.value?.files?.[0]
    if (
        !file ||
        !file.name.toLowerCase().endsWith('.pdf') ||
        !file.size ||
        file.size > MAX_APPLICATION_ARTIFACT_BYTES
    ) {
        uploadError.value = 'Choose a PDF file up to 50 MB.'
        return
    }
    saving.value = true
    uploadError.value = ''
    try {
        const target = uploadTarget.value
            ? { id: uploadTarget.value.id }
            : { name: name.value.trim() }
        const saved = await uploadResume(target, file)
        resumes.value = [...resumes.value.filter(({ id }) => id !== saved.id), saved].sort((a, b) =>
            a.name.localeCompare(b.name),
        )
        uploadOpen.value = false
        status.value = `Saved ${saved.name}.`
    } catch (error) {
        uploadError.value = errorMessage(error)
    } finally {
        saving.value = false
    }
}

onMounted(load)
</script>

<template>
    <main class="settings glass-frame" data-testid="resume-settings">
        <header class="page-heading">
            <h1>Settings</h1>
        </header>
        <AutomationSettings />
        <header class="section-heading">
            <h2 id="resumes-heading">Resumes</h2>
        </header>
        <section class="settings-section" aria-labelledby="resumes-heading">
            <p v-if="loading" class="section-message muted" role="status">Loading resumes…</p>
            <div v-else-if="loadError" class="load-error">
                <p role="alert">{{ loadError }}</p>
                <BaseButton preset="secondary" @click="load">Try again</BaseButton>
            </div>
            <p v-else-if="resumes.length === 0" class="section-message muted">
                No resumes uploaded.
            </p>
            <ul v-else class="resume-list">
                <li
                    v-for="resume in resumes"
                    :key="resume.id"
                    class="resume-row"
                    :data-testid="`resume-${resume.id}`"
                >
                    <template v-for="upload in resume.uploads.slice(0, 1)" :key="upload.id">
                        <div class="resume-details" :data-testid="`details-${resume.id}`">
                            <div class="resume-heading">
                                <strong class="resume-name">{{ resume.name }}</strong>
                                <p class="resume-date muted">
                                    <span class="date-separator" aria-hidden="true">-</span>
                                    <span>
                                        Last upload:
                                        <time :datetime="upload.uploadedAt">{{
                                            formatDate(upload.uploadedAt)
                                        }}</time>
                                    </span>
                                </p>
                            </div>
                            <BaseButton
                                class="history-button"
                                preset="text"
                                :disabled="resume.uploads.length <= 1"
                                :data-testid="`history-${resume.id}`"
                                @click="history = resume"
                                >Previous uploads
                                <span class="muted"
                                    >({{ resume.uploads.length - 1 }})</span
                                ></BaseButton
                            >
                        </div>
                        <div class="resume-actions">
                            <BaseButton
                                as="a"
                                preset="icon"
                                icon-size="md"
                                tooltip="Open PDF"
                                :data-testid="`open-${resume.id}`"
                                :href="resumeUploadUrl(upload.id)"
                                target="_blank"
                                rel="noopener"
                                :aria-label="`Open ${resume.name} PDF in a new tab`"
                            >
                                <OpenExternalIcon class="resume-action-icon" />
                            </BaseButton>
                            <BaseButton
                                as="a"
                                preset="icon"
                                icon-size="md"
                                tooltip="Download PDF"
                                :data-testid="`download-${resume.id}`"
                                :href="resumeUploadUrl(upload.id, true)"
                                :aria-label="`Download ${resume.name} PDF`"
                            >
                                <DownloadIcon class="resume-action-icon" />
                            </BaseButton>
                            <BaseButton
                                preset="icon"
                                icon-size="md"
                                tooltip="Upload new PDF"
                                :aria-label="`Upload new PDF for ${resume.name}`"
                                :disabled="saving"
                                :data-testid="`upload-${resume.id}`"
                                @click="openUpload(resume)"
                            >
                                <UploadIcon class="resume-action-icon" />
                            </BaseButton>
                        </div>
                    </template>
                </li>
            </ul>
            <p class="save-status" role="status" data-testid="resume-save-status">{{ status }}</p>
        </section>
        <footer class="section-footer">
            <BaseButton
                :disabled="loading || !!loadError || saving"
                data-testid="add-resume"
                @click="openUpload(null)"
            >
                Add resume
            </BaseButton>
        </footer>
    </main>

    <BasePopUp
        :open="uploadOpen"
        :heading="uploadTarget ? `Upload new PDF · ${uploadTarget.name}` : 'Add resume'"
        :error="uploadError"
        class="upload-dialog"
        data-testid="resume-upload-dialog"
        @close="!saving && (uploadOpen = false)"
    >
        <form class="upload-form" :aria-busy="saving" @submit.prevent="save">
            <label v-if="!uploadTarget" class="field">
                Resume name
                <input
                    v-model="name"
                    data-testid="resume-name"
                    required
                    maxlength="120"
                    placeholder="e.g. Frontend engineering"
                    :disabled="saving"
                    autofocus
                />
            </label>
            <label class="field">
                PDF file <span class="muted">Up to 50 MB</span>
                <input
                    ref="fileInput"
                    data-testid="resume-file"
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    :disabled="saving"
                />
            </label>
            <BaseButton type="submit" data-testid="save-resume" :disabled="saving">{{
                saving ? 'Uploading…' : 'Save resume'
            }}</BaseButton>
        </form>
    </BasePopUp>

    <BasePopUp
        :open="history !== null"
        eyebrow="Previous uploads"
        :heading="history?.name ?? ''"
        class="history-dialog"
        data-testid="resume-history-dialog"
        @close="history = null"
    >
        <p v-if="history?.uploads.length === 1" class="muted">No previous uploads yet.</p>
        <ol v-else class="history-list">
            <li v-for="upload in history?.uploads.slice(1)" :key="upload.id" class="history-item">
                <time :datetime="upload.uploadedAt">{{ formatDate(upload.uploadedAt) }}</time>
                <div class="actions">
                    <BaseButton
                        as="a"
                        preset="text"
                        :href="resumeUploadUrl(upload.id)"
                        target="_blank"
                        rel="noopener"
                        :aria-label="`Open ${upload.fileName} uploaded ${formatDate(upload.uploadedAt)} in a new tab`"
                        >Open PDF ↗</BaseButton
                    >
                    <BaseButton
                        as="a"
                        preset="text"
                        :href="resumeUploadUrl(upload.id, true)"
                        :aria-label="`Download ${upload.fileName} uploaded ${formatDate(upload.uploadedAt)}`"
                        >Download</BaseButton
                    >
                </div>
            </li>
        </ol>
    </BasePopUp>
</template>

<style scoped lang="scss">
.settings {
    width: 100%;
    max-width: 60rem;
    align-self: center;
    padding: $space-5;
    border-radius: $radius-lg;
}

.resume-heading,
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    align-items: center;
}

.page-heading {
    margin-bottom: $space-4;
}

.section-heading {
    margin-top: $space-6;
    padding-top: $space-6;
    padding-bottom: $space-3;
    border-top: 1px solid $color-ink-alpha-12;
}

.settings-section {
    padding: $space-1 $space-4;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-18;
    border-radius: $radius-md;
}

.muted {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

h1 {
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.1;
    text-wrap: balance;
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

.resume-name {
    font-size: 1rem;
    font-weight: 600;
    overflow-wrap: anywhere;
}

.resume-list {
    padding: 0;
    margin: 0;
    list-style: none;
}

.resume-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: $space-4;
    align-items: center;
    padding: $space-4 $space-2;

    & + & {
        border-top: 1px solid $color-ink-alpha-9;
    }
}

.resume-details {
    display: grid;
    gap: $space-1;
    min-width: 0;
    justify-items: start;
}

.resume-date {
    display: flex;
    gap: $space-2;
    align-items: center;
}

.history-button {
    gap: $space-1;
    min-height: 1.5rem;
    color: $color-ink-secondary;
    font-size: 0.8125rem;
}

.actions {
    gap: $space-4;
}

.resume-actions {
    display: flex;
    gap: $space-1;
    align-items: center;
}

.resume-action-icon {
    width: 1.125rem;
    height: 1.125rem;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.75;
}

.section-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: $space-4;
}

.section-message,
.load-error {
    padding: $space-5 0;
}

.load-error {
    display: grid;
    justify-items: start;
    gap: $space-3;
}

@media (width <= 42rem) {
    .settings {
        padding: $space-4;
    }
}

@media (width <= 40rem) {
    .resume-heading {
        flex-direction: column;
        gap: $space-1;
        align-items: flex-start;
    }

    .date-separator {
        display: none;
    }
}

@media (width <= 30rem) {
    .resume-row {
        grid-template-columns: minmax(0, 1fr);
        gap: $space-2;
    }

    .resume-actions {
        justify-self: end;
    }
}

.save-status {
    color: $color-signal-light;

    &:not(:empty) {
        margin-top: $space-4;
    }
}

.upload-form,
.field {
    display: grid;
    gap: $space-2;
}

.upload-form {
    gap: $space-4;
    margin-top: $space-4;
}

input {
    width: 100%;
    min-width: 0;
    padding: $space-2;
    font: inherit;
    color: $color-ink;
    background: $color-ink-alpha-5;
    border: 1px solid $color-signal-light-alpha-28;
    border-radius: $radius-md;
}

input::file-selector-button {
    padding: $space-2;
    margin-right: $space-2;
    cursor: pointer;
}

.upload-dialog,
.history-dialog {
    width: min(36rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow-y: auto;
    overflow-wrap: anywhere;
}

.history-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border-top: 1px solid $color-ink-alpha-9;
}

.history-item {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
    padding: $space-3 $space-2;
    border-bottom: 1px solid $color-ink-alpha-9;
}

.history-item .actions {
    margin-left: auto;
}
</style>

<style lang="scss">
.resume-actions .base-button {
    color: $color-ink-secondary;

    &:hover,
    &:focus-visible {
        color: $color-ink;
        background: $color-ink-alpha-9;
    }

    @media (width <= 30rem), (pointer: coarse) {
        width: 2.75rem;
        height: 2.75rem;
    }
}
</style>
