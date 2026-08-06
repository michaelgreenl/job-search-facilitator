import type { ApplicationArtifact, ApplicationArtifactKind } from '@job-search-facilitator/core'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApplicationArtifactController } from '../src/api/controllers/application-artifact.controller.ts'
import type { ApplicationArtifactRepository } from '../src/db/repositories/application-artifact.repository.ts'

const jobPostId = '11111111-1111-4111-8111-111111111111'
const uploadedAt = '2026-08-05T20:00:00.000Z'

const createArtifact = (
    kind: ApplicationArtifactKind,
    fileName: string,
    mediaType: string,
    sizeBytes: number,
): ApplicationArtifact => ({ kind, fileName, mediaType, sizeBytes, uploadedAt })

const createTestApp = (repository: ApplicationArtifactRepository) => {
    const app = express()
    const controller = createApplicationArtifactController(repository)
    app.put(
        '/job-posts/:id/artifacts/:kind',
        express.raw({ limit: '50mb', type: () => true }),
        controller.save,
    )
    app.get('/job-posts/:id/artifacts/:kind', controller.open)
    app.delete('/job-posts/:id/artifacts/:kind', controller.remove)
    return app
}

describe('application artifact routes', () => {
    it('accepts a PDF upload and returns its stored metadata', async () => {
        const content = Buffer.from('%PDF-1.7 fixture')
        const artifact = createArtifact('resume', 'frontend resume.pdf', 'application/pdf', 16)
        const save = vi.fn(async () => artifact)
        const repository = {
            save,
            findFile: vi.fn(async () => null),
            remove: vi.fn(async () => false),
        } satisfies ApplicationArtifactRepository

        await request(createTestApp(repository))
            .put(`/job-posts/${jobPostId}/artifacts/resume`)
            .set('Content-Type', 'application/pdf')
            .set('X-Artifact-Filename', encodeURIComponent(artifact.fileName))
            .send(content)
            .expect(200, artifact)

        expect(save).toHaveBeenCalledExactlyOnceWith(jobPostId, 'resume', {
            content,
            fileName: artifact.fileName,
            mediaType: 'application/pdf',
        })
    })

    it('rejects a non-PDF resume without saving it', async () => {
        const save = vi.fn(async () => null)
        const repository = {
            save,
            findFile: vi.fn(async () => null),
            remove: vi.fn(async () => false),
        } satisfies ApplicationArtifactRepository

        await request(createTestApp(repository))
            .put(`/job-posts/${jobPostId}/artifacts/resume`)
            .set('Content-Type', 'application/pdf')
            .set('X-Artifact-Filename', 'resume.pdf')
            .send(Buffer.from('not a PDF'))
            .expect(400)

        expect(save).not.toHaveBeenCalled()
    })

    it('accepts a complete web archive for the application page', async () => {
        const content = Buffer.from('bplist00 fixture')
        const artifact = createArtifact(
            'application-page',
            'application.webarchive',
            'application/x-webarchive',
            content.byteLength,
        )
        const save = vi.fn(async () => artifact)
        const repository = {
            save,
            findFile: vi.fn(async () => null),
            remove: vi.fn(async () => false),
        } satisfies ApplicationArtifactRepository

        await request(createTestApp(repository))
            .put(`/job-posts/${jobPostId}/artifacts/application-page`)
            .set('Content-Type', 'application/octet-stream')
            .set('X-Artifact-Filename', artifact.fileName)
            .send(content)
            .expect(200, artifact)

        expect(save).toHaveBeenCalledExactlyOnceWith(jobPostId, 'application-page', {
            content,
            fileName: artifact.fileName,
            mediaType: artifact.mediaType,
        })
    })

    it('serves a stored artifact with an inline filename', async () => {
        const content = Buffer.from('%PDF-1.7 fixture')
        const artifact = createArtifact('resume', 'frontend resume.pdf', 'application/pdf', 16)
        const repository = {
            save: vi.fn(async () => null),
            findFile: vi.fn(async () => ({ artifact, content })),
            remove: vi.fn(async () => false),
        } satisfies ApplicationArtifactRepository

        const response = await request(createTestApp(repository))
            .get(`/job-posts/${jobPostId}/artifacts/resume`)
            .expect('Content-Type', 'application/pdf')
            .expect(200)

        expect({
            body: response.body,
            disposition: response.headers['content-disposition'],
        }).toEqual({
            body: content,
            disposition:
                'inline; filename="frontend resume.pdf"; filename*=UTF-8\'\'frontend%20resume.pdf',
        })
    })

    it('removes the selected artifact', async () => {
        const remove = vi.fn(async () => true)
        const repository = {
            save: vi.fn(async () => null),
            findFile: vi.fn(async () => null),
            remove,
        } satisfies ApplicationArtifactRepository

        await request(createTestApp(repository))
            .delete(`/job-posts/${jobPostId}/artifacts/cover-letter`)
            .expect(204)

        expect(remove).toHaveBeenCalledExactlyOnceWith(jobPostId, 'cover-letter')
    })
})
