import { MAX_JSON_REQUEST_BYTES } from '@job-search-facilitator/core'
import request from 'supertest'
import { describe, it } from 'vitest'
import { app } from '../src/app.ts'

const jsonBodyAtSize = (size: number): string => {
    const prefix = '{"report":"'
    const suffix = '"}'

    return `${prefix}${'x'.repeat(size - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))}${suffix}`
}

describe('GET /health', () => {
    it('reports that the server is healthy', async () => {
        await request(app)
            .get('/health')
            .expect(200, {
                status: 'healthy',
                capabilities: { jobSearchNetNewGuard: 1 },
            })
    })
})

describe('API routes', () => {
    it('accepts JSON at the shared request limit before routing', async () => {
        await request(app)
            .post('/api/not-a-route')
            .set('Content-Type', 'application/json')
            .send(jsonBodyAtSize(MAX_JSON_REQUEST_BYTES))
            .expect(404)
    })

    it('rejects JSON one byte above the shared request limit', async () => {
        await request(app)
            .post('/api/not-a-route')
            .set('Content-Type', 'application/json')
            .send(jsonBodyAtSize(MAX_JSON_REQUEST_BYTES + 1))
            .expect(413)
    })

    it.each(['/api/job-posts/invalid-id', '/api/job-search-reports/invalid-id'])(
        'mounts %s',
        async (path) => {
            await request(app).get(path).expect(400)
        },
    )
})
