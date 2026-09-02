<script setup lang="ts">
import type { BaseResumeVersion, ProfileSection } from '@job-search-facilitator/core'
import { onMounted, ref, shallowRef } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePopUp from '@/components/base/BasePopUp.vue'
import { baseResumeUrl, fetchSettings, saveSettings, uploadBaseResume } from '@/services/settings'

const sections = ref<ProfileSection[]>([])
const resumes = shallowRef<BaseResumeVersion[]>([])
const loading = shallowRef(true)
const saving = shallowRef(false)
const issue = shallowRef<string | null>(null)
const saved = shallowRef(false)
const uploadOpen = shallowRef(false)
const uploading = shallowRef(false)
const uploadIssue = shallowRef<string | null>(null)
const versionName = shallowRef('')
const resumeFile = shallowRef<File | null>(null)

const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback

async function load() {
    loading.value = true
    issue.value = null

    try {
        const settings = await fetchSettings()
        sections.value = settings.sections.map((section) => ({ ...section }))
        resumes.value = settings.resumes
    } catch (error) {
        issue.value = errorMessage(error, 'Could not load settings')
    } finally {
        loading.value = false
    }
}

async function save() {
    if (saving.value) {
        return
    }

    saving.value = true
    saved.value = false
    issue.value = null

    try {
        const settings = await saveSettings(sections.value)
        sections.value = settings.sections.map((section) => ({ ...section }))
        resumes.value = settings.resumes
        saved.value = true
    } catch (error) {
        issue.value = errorMessage(error, 'Could not save settings')
    } finally {
        saving.value = false
    }
}

function openUpload() {
    versionName.value = ''
    resumeFile.value = null
    uploadIssue.value = null
    uploadOpen.value = true
}

function closeUpload() {
    if (!uploading.value) {
        uploadOpen.value = false
        uploadIssue.value = null
    }
}

function selectResume(event: Event) {
    resumeFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function upload() {
    const name = versionName.value.trim()

    if (!name || resumeFile.value === null) {
        uploadIssue.value = 'Enter a version name and choose a PDF.'
        return
    }

    uploading.value = true
    uploadIssue.value = null

    try {
        const resume = await uploadBaseResume(name, resumeFile.value)
        resumes.value = [resume, ...resumes.value]
        uploadOpen.value = false
    } catch (error) {
        uploadIssue.value = errorMessage(error, 'Could not upload the resume')
    } finally {
        uploading.value = false
    }
}

const formatSize = (bytes: number) =>
    bytes < 1024 * 1024
        ? `${Math.ceil(bytes / 1024)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
    )

onMounted(load)
</script>

<template>
    <main class="settings-view" data-testid="settings-view">
        <header class="page-heading">
            <div>
                <span class="eyebrow">Agent context</span>
                <h1>Settings</h1>
            </div>
            <p>
                Saved profile fields and resume names become the local context for every job-search
                agent.
            </p>
        </header>

        <p v-if="loading" class="state-message" role="status">Loading settings…</p>

        <template v-else>
            <p v-if="issue" class="state-message is-error" role="alert">{{ issue }}</p>

            <section class="settings-card glass-frame" aria-labelledby="resume-settings-title">
                <div class="section-heading">
                    <div>
                        <h2 id="resume-settings-title">Base resume versions</h2>
                        <p>Agents use these exact version names when they recommend a resume.</p>
                    </div>
                    <BaseButton
                        preset="outline"
                        data-testid="upload-base-resume"
                        @click="openUpload"
                    >
                        Upload version
                    </BaseButton>
                </div>

                <ul v-if="resumes.length" class="resume-list">
                    <li v-for="resume in resumes" :key="resume.id" class="resume-row">
                        <div>
                            <strong>{{ resume.name }}</strong>
                            <span>{{ resume.fileName }} · {{ formatSize(resume.sizeBytes) }}</span>
                        </div>
                        <div class="resume-meta">
                            <time :datetime="resume.uploadedAt">{{
                                formatDate(resume.uploadedAt)
                            }}</time>
                            <BaseButton
                                as="a"
                                preset="text"
                                :href="baseResumeUrl(resume.id)"
                                target="_blank"
                                rel="noopener"
                            >
                                Open
                            </BaseButton>
                        </div>
                    </li>
                </ul>
                <p v-else class="empty-state">
                    Upload a PDF to add the first recommendation option.
                </p>
            </section>

            <form class="profile-form" @submit.prevent="save">
                <section class="settings-card glass-frame" aria-labelledby="profile-settings-title">
                    <div class="section-heading">
                        <div>
                            <h2 id="profile-settings-title">Profile and search preferences</h2>
                            <p>Each field maps to a section in the private agent context file.</p>
                        </div>
                    </div>

                    <div class="section-grid">
                        <label
                            v-for="(section, index) in sections"
                            :key="section.title"
                            class="field"
                        >
                            <span>{{ section.title }}</span>
                            <textarea
                                v-model="section.content"
                                rows="7"
                                :data-testid="`settings-section-${index}`"
                                @input="saved = false"
                            ></textarea>
                        </label>
                    </div>
                </section>

                <div class="save-bar glass-frame">
                    <span class="save-status" role="status">{{
                        saved ? 'Settings saved.' : ''
                    }}</span>
                    <BaseButton type="submit" :disabled="saving" data-testid="save-settings">
                        {{ saving ? 'Saving…' : 'Save settings' }}
                    </BaseButton>
                </div>
            </form>
        </template>

        <BasePopUp
            :open="uploadOpen"
            heading="Upload resume version"
            :error="uploadIssue"
            error-test-id="resume-upload-error"
            @close="closeUpload"
        >
            <template #default="{ errorId }">
                <form class="upload-form" @submit.prevent="upload">
                    <label class="field">
                        <span>Version name</span>
                        <input
                            v-model="versionName"
                            data-testid="resume-version-name"
                            maxlength="200"
                            autocomplete="off"
                            :aria-describedby="uploadIssue ? errorId : undefined"
                        />
                    </label>
                    <label class="field">
                        <span>PDF file</span>
                        <input
                            type="file"
                            accept=".pdf,application/pdf"
                            data-testid="resume-version-file"
                            :aria-describedby="uploadIssue ? errorId : undefined"
                            @change="selectResume"
                        />
                    </label>
                    <BaseButton
                        type="submit"
                        :disabled="uploading"
                        data-testid="save-resume-version"
                    >
                        {{ uploading ? 'Uploading…' : 'Save version' }}
                    </BaseButton>
                </form>
            </template>
        </BasePopUp>
    </main>
</template>

<style scoped lang="scss">
.settings-view {
    display: grid;
    width: min(100%, 72rem);
    gap: $space-5;
    align-self: center;
    padding: $space-8 0 $space-6;
}

.page-heading {
    display: grid;
    gap: $space-3;
    padding: 0 $space-2;

    @include bp-md-tablet {
        grid-template-columns: minmax(16rem, 0.8fr) minmax(20rem, 1.2fr);
        align-items: end;
    }
}

.page-heading > div {
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

h1,
h2 {
    margin: 0;
}

h1 {
    font-size: clamp(2rem, 6vw, 3rem);
    font-weight: 600;
    letter-spacing: -0.055em;
    line-height: 1;
}

h2 {
    font-size: 1.125rem;
}

.page-heading p,
.section-heading p,
.empty-state,
.resume-row span,
.resume-meta,
.state-message {
    color: $color-ink-secondary;
}

.settings-card {
    display: grid;
    gap: $space-5;
    padding: $space-5;
    border-radius: $radius-xl;
}

.section-heading {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: end;
    justify-content: space-between;
}

.section-heading > div {
    display: grid;
    gap: $space-1;
}

.section-grid {
    display: grid;
    gap: $space-4;

    @include bp-md-tablet {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.field {
    display: grid;
    gap: $space-2;
    color: $color-ink-secondary;
    font-size: 0.8125rem;
    font-weight: 650;
}

textarea,
input {
    width: 100%;
    padding: $space-3;
    color: $color-ink;
    font: inherit;
    font-weight: 400;
    background: $color-night-deep;
    border: 1px solid $color-ink-alpha-16;
    border-radius: $radius-md;
}

textarea {
    min-height: 9rem;
    line-height: 1.5;
    resize: vertical;
}

textarea:hover,
input:hover,
textarea:focus,
input:focus {
    border-color: $color-signal-light-alpha-50;
}

.profile-form {
    display: grid;
    gap: $space-4;
}

.save-bar {
    position: sticky;
    bottom: $space-3;
    display: flex;
    gap: $space-3;
    align-items: center;
    justify-content: flex-end;
    padding: $space-3;
    border-radius: $radius-lg;
}

.save-status {
    color: $color-signal-light;
    font-size: 0.8125rem;
}

.resume-list {
    display: grid;
    gap: $space-2;
    padding: 0;
    margin: 0;
    list-style: none;
}

.resume-row {
    display: flex;
    flex-wrap: wrap;
    gap: $space-3;
    align-items: center;
    justify-content: space-between;
    padding: $space-3;
    background: $color-ink-alpha-5;
    border: 1px solid $color-ink-alpha-9;
    border-radius: $radius-md;
}

.resume-row > div {
    display: grid;
    gap: $space-1;
}

.resume-row span,
.resume-meta {
    font-size: 0.75rem;
}

.resume-meta {
    justify-items: end;
}

.state-message {
    padding: $space-5;
    text-align: center;
}

.state-message.is-error {
    color: lighten-color($color-red-600, 20%);
}

.upload-form {
    display: grid;
    gap: $space-4;
}

@include bp-max('sm') {
    .settings-view {
        padding-top: $space-7;
    }

    .settings-card {
        padding: $space-4;
    }

    .resume-meta {
        width: 100%;
        grid-template-columns: 1fr auto;
        place-items: center start;
    }
}
</style>
