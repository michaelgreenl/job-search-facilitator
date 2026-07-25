import request from 'supertest'
import { describe, it } from 'vitest'
import { app } from '../src/app.ts'

describe('GET /health', () => {
    it('reports that the server is healthy', async () => {
        await request(app).get('/health').expect(200, { status: 'healthy' })
    })
})

describe('API routes', () => {
    it.each(['/api/job-posts/invalid-id', '/api/job-search-reports/invalid-id'])(
        'mounts %s',
        async (path) => {
            await request(app).get(path).expect(400)
        },
    )
})
