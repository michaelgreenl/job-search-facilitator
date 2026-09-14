<script setup lang="ts">
import { MAX_APPLICATION_ARTIFACT_BYTES, type Resume } from '@job-search-facilitator/core'
import { onMounted, shallowRef, useTemplateRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BasePopUp from '@/components/base/BasePopUp.vue'
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
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
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
            <div>
                <p class="eyebrow">Settings</p>
                <h1>Resumes</h1>
            </div>
            <BaseButton
                :disabled="loading || !!loadError || saving"
                data-testid="add-resume"
                @click="openUpload(null)"
            >
                <span aria-hidden="true">＋</span> Add resume
            </BaseButton>
        </header>
        <p v-if="loading" role="status">Loading resumes…</p>
        <div v-else-if="loadError" class="load-error">
            <p role="alert">{{ loadError }}</p>
            <BaseButton preset="outline" @click="load">Try again</BaseButton>
        </div>
        <p v-else-if="resumes.length === 0" class="empty-state muted">No resumes uploaded.</p>
        <div v-else class="resume-list">
            <BaseCard
                v-for="resume in resumes"
                :key="resume.id"
                class="resume-card"
                :data-testid="`resume-${resume.id}`"
            >
                <div class="resume-heading">
                    <h2>{{ resume.name }}</h2>
                    <span class="current-badge">Current PDF</span>
                </div>
                <template v-for="upload in resume.uploads.slice(0, 1)" :key="upload.id">
                    <p class="file-name">{{ upload.fileName }}</p>
                    <p class="muted">
                        <time :datetime="upload.uploadedAt">{{
                            formatDate(upload.uploadedAt)
                        }}</time>
                        ·
                        {{
                            (upload.sizeBytes / 1024).toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                            })
                        }}
                        KB
                    </p>
                    <div class="actions">
                        <BaseButton
                            as="a"
                            preset="outline"
                            :href="resumeUploadUrl(upload.id)"
                            target="_blank"
                            rel="noopener"
                            :aria-label="`Open ${resume.name} PDF in a new tab`"
                            >Open PDF ↗</BaseButton
                        >
                        <BaseButton
                            as="a"
                            preset="text"
                            :href="resumeUploadUrl(upload.id, true)"
                            :aria-label="`Download ${resume.name} PDF`"
                            >Download</BaseButton
                        >
                    </div>
                </template>
                <footer class="card-footer">
                    <BaseButton
                        preset="outline"
                        :disabled="saving"
                        :data-testid="`upload-${resume.id}`"
                        @click="openUpload(resume)"
                        >Upload new PDF</BaseButton
                    >
                    <BaseButton
                        preset="text"
                        :data-testid="`history-${resume.id}`"
                        @click="history = resume"
                        >View previous uploads
                        <span class="muted">({{ resume.uploads.length - 1 }})</span></BaseButton
                    >
                </footer>
            </BaseCard>
        </div>
        <p class="save-status" role="status" data-testid="resume-save-status">{{ status }}</p>
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
        :heading="`Previous uploads · ${history?.name ?? ''}`"
        class="history-dialog"
        data-testid="resume-history-dialog"
        @close="history = null"
    >
        <p v-if="history?.uploads.length === 1" class="muted">No previous uploads yet.</p>
        <ol v-else class="history-list">
            <li v-for="upload in history?.uploads.slice(1)" :key="upload.id" class="history-item">
                <time :datetime="upload.uploadedAt">{{ formatDate(upload.uploadedAt) }}</time>
                <p class="file-name muted">{{ upload.fileName }}</p>
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
    padding: clamp(1rem, 4vw, 2.5rem);
    margin-top: 3.5rem;
    border-radius: $radius-lg;
}

.page-heading,
.resume-heading,
.actions,
.card-footer {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
}

.page-heading {
    justify-content: space-between;
    margin-bottom: $space-4;
}

.eyebrow,
.muted {
    color: $color-ink-secondary;
    font-size: 0.875rem;
}

.eyebrow {
    margin-bottom: $space-1;
}

h1 {
    font-size: 1.75rem;
}

h2 {
    margin: 0;
    font-size: 1.125rem;
    overflow-wrap: anywhere;
}

.resume-list {
    display: grid;
    gap: $space-4;
    margin-top: $space-6;
}

.resume-card {
    padding: $space-4;
    gap: $space-2;
}

.resume-heading {
    justify-content: space-between;
}

.current-badge {
    color: $color-signal-light;
    font-size: 0.75rem;
    white-space: nowrap;
}

.file-name {
    overflow-wrap: anywhere;
}

.actions {
    margin-top: $space-2;
    gap: $space-4;
}

.card-footer {
    margin-top: $space-3;
    padding-top: $space-4;
    border-top: 1px solid $color-ink-alpha-9;
}

.card-footer .preset-text {
    gap: $space-1;
}

.empty-state {
    margin-top: $space-6;
    padding: $space-6 0;
    border-top: 1px solid $color-ink-alpha-9;
}

.load-error {
    display: grid;
    justify-items: start;
    gap: $space-3;
    margin-top: $space-4;
}

.save-status {
    margin-top: $space-4;
    color: $color-signal-light;
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
}

.history-item {
    padding: $space-4 0;
    border-bottom: 1px solid $color-ink-alpha-9;
}

.history-item:last-child {
    border-bottom: 0;
}
</style>
