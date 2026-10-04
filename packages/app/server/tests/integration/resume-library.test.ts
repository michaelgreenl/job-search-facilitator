import { randomUUID } from 'node:crypto'
import {
    parseResume,
    parseResumes,
    type CreateUserAddedJobPostInput,
} from '@job-search-facilitator/core'
import request from 'supertest'
import { afterAll, beforeEach, expect, it } from 'vitest'
import { app } from '../../src/app.ts'
import { prisma } from '../../src/db/prisma.ts'
import { validateSerializedReport } from '../../src/job-search-artifact.ts'

if (!new URL(process.env.DATABASE_URL ?? '').pathname.endsWith('_test')) {
    throw new Error('Resume integration tests require a disposable _test database')
}

beforeEach(async () => {
    await prisma.resume.deleteMany()
    await prisma.jobPost.deleteMany()
    await prisma.jobSearchReport.deleteMany()
})
afterAll(async () => {
    await prisma.resume.deleteMany()
    await prisma.$disconnect()
})

const upload = (path: string, text: string) =>
    request(app)
        .post(path)
        .set('Content-Type', 'application/pdf')
        .set('X-Artifact-Filename', encodeURIComponent('résumé.pdf'))
        .send(Buffer.from(text))

it('retains every timestamped upload, including simultaneous uploads, and serves immutable PDFs', async () => {
    const firstResponse = await upload(
        '/api/resumes?name=Product%20engineering',
        '%PDF-first',
    ).expect(201)
    const first = parseResume(firstResponse.body)
    await Promise.all(
        ['second', 'third'].map((text) =>
            upload(`/api/resumes/${first.id}/uploads`, `%PDF-${text}`).expect(201),
        ),
    )
    const latest = parseResume(
        (await upload(`/api/resumes/${first.id}/uploads`, '%PDF-latest').expect(201)).body,
    )
    const library = parseResumes((await request(app).get('/api/resumes').expect(200)).body)
    expect(library).toEqual([latest])
    expect(latest.uploads.map(({ id }) => id)).toEqual([
        latest.uploads[0]!.id,
        expect.any(String),
        expect.any(String),
        first.uploads[0]!.id,
    ])
    expect(latest.uploads.every(({ uploadedAt }) => Number.isFinite(Date.parse(uploadedAt)))).toBe(
        true,
    )
    const files = await Promise.all(
        latest.uploads.map(async ({ id }) => {
            const response = await request(app)
                .get(`/api/resumes/uploads/${id}`)
                .expect('Content-Type', 'application/pdf')
                .expect(200)
            return (response.body as Buffer).toString()
        }),
    )
    expect(files[0]).toBe('%PDF-latest')
    expect(files.slice(1).sort()).toEqual(['%PDF-first', '%PDF-second', '%PDF-third'])
    const downloaded = await request(app)
        .get(`/api/resumes/uploads/${first.uploads[0]!.id}?download=true`)
        .expect(200)
    expect({
        disposition: downloaded.headers['content-disposition'],
        bytes: (downloaded.body as Buffer).toString(),
    }).toEqual({
        disposition: expect.stringMatching(/^attachment;.*r%C3%A9sum%C3%A9.pdf/),
        bytes: '%PDF-first',
    })
    await upload('/api/resumes?name=Product%20engineering', '%PDF-duplicate').expect(409)
    await upload(`/api/resumes/${first.id}/uploads`, 'not a PDF').expect(400)
    expect(parseResumes((await request(app).get('/api/resumes')).body)).toEqual(library)
})

it('preserves old recommendations and accepts only library names for new search reports and imports', async () => {
    const input: CreateUserAddedJobPostInput = {
        agentLabel: 'target',
        fitRationale: 'Relevant product experience',
        applicationFlow: 'Direct form',
        keyLegitimacySignals: 'Employer careers page',
        recommendedResume: 'frontend',
        recommendedAction: 'Apply',
        legitimacyNotes: null,
        post: {
            sourceKey: 'resume:legacy',
            description: 'Build accessible interfaces.',
            roleTitle: 'Frontend engineer',
            company: 'Example',
            location: null,
            compensation: null,
            techStack: 'TypeScript',
            postSource: 'Employer',
            postUrl: 'https://example.com/jobs/1',
            applicationUrl: 'https://example.com/apply/1',
            postStatus: 'active',
        },
    }
    await request(app).post('/api/job-posts').send(input).expect(201)
    await upload('/api/resumes?name=UI%20engineer', '%PDF-UI').expect(201)
    const reportId = randomUUID()
    const reportPath = `/api/job-search-reports/2026-09-14/${reportId}`
    const report = {
        summary: 'One match',
        results: [
            {
                ...input,
                agentRank: 1,
                recommendedResume: 'UI engineer',
                post: {
                    ...input.post,
                    sourceKey: 'resume:report',
                    postUrl: 'https://example.com/jobs/2',
                    applicationUrl: 'https://example.com/apply/2',
                },
            },
        ],
    }
    await request(app)
        .put(`${reportPath}?requireNetNew=true`)
        .send(validateSerializedReport(JSON.stringify(report)))
        .expect(201)
    expect(
        (await request(app).get(`/api/job-search-reports/${reportId}`)).body.results[0]
            .recommendedResume,
    ).toBe('UI engineer')
    await request(app)
        .put(reportPath)
        .send({ ...report, results: [{ ...report.results[0], recommendedResume: 'Typo' }] })
        .expect(400)
    expect(
        (await request(app).get(`/api/job-search-reports/${reportId}`)).body.results[0]
            .recommendedResume,
    ).toBe('UI engineer')
    await request(app)
        .post('/api/job-posts')
        .send({
            ...input,
            recommendedResume: 'Typo',
            post: { ...input.post, sourceKey: 'resume:invalid' },
        })
        .expect(400)
    expect(await prisma.jobPost.findUnique({ where: { sourceKey: 'resume:invalid' } })).toBeNull()
    const legacy = await request(app).get('/api/job-posts/user-added')
    expect(legacy.body[0].recommendedResume).toBe('frontend')
    const imported = await request(app)
        .post('/api/job-posts')
        .send({ ...input, recommendedResume: 'UI engineer' })
        .expect(200)
    expect(imported.body.recommendedResume).toBe('UI engineer')
})
