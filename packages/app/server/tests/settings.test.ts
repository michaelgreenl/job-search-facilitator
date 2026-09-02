import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createSettingsRouter } from '../src/api/routes/settings.route.ts'
import { createFileSettingsRepository } from '../src/settings/file-settings.repository.ts'

const temporaryDirectories: string[] = []

const createTestApp = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'job-search-settings-'))
    temporaryDirectories.push(directory)
    await writeFile(
        join(directory, 'user-info.md'),
        '# Existing profile\n\nPrivate context.\n\n## Target work\n\nFrontend roles.\n\n## Skills\n\nVue and TypeScript.\n',
    )
    const app = express()
    app.use(express.json())
    app.use('/settings', createSettingsRouter(createFileSettingsRepository(directory)))
    return { app, directory }
}

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
    )
})

describe('settings routes', () => {
    it('saves profile sections and adds named resume versions to agent context', async () => {
        const { app, directory } = await createTestApp()
        const initial = await request(app).get('/settings').expect(200)

        expect(initial.body.sections).toEqual([
            { title: 'Target work', content: 'Frontend roles.' },
            { title: 'Skills', content: 'Vue and TypeScript.' },
        ])

        await request(app)
            .put('/settings')
            .send({
                sections: [
                    { title: 'Target work', content: 'Frontend and full-stack roles.' },
                    { title: 'Skills', content: 'Vue, TypeScript, and Node.' },
                ],
            })
            .expect(200)

        const resume = await request(app)
            .post('/settings/resumes')
            .set('Content-Type', 'application/pdf')
            .set('X-Artifact-Filename', 'resume.pdf')
            .set('X-Resume-Version-Name', encodeURIComponent('Frontend · September 2026'))
            .send(Buffer.from('%PDF-1.7 fixture'))
            .expect(201)

        await request(app)
            .get(`/settings/resumes/${resume.body.id as string}`)
            .expect('Content-Type', 'application/pdf')
            .expect(200)

        const profile = await readFile(join(directory, 'user-info.md'), 'utf8')
        expect(profile).toContain('Frontend and full-stack roles.')
        expect(profile).toContain('Frontend · September 2026')
        expect(profile).toContain(`resumes/${resume.body.id as string}.pdf`)
    })
})
