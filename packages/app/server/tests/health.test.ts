import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'

describe('GET /health', () => {
  it('returns the server health', async () => {
    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'healthy',
      },
    })
    expect(response.body.data.timestamp).toEqual(expect.any(String))
    expect(response.body.data.uptime).toEqual(expect.any(Number))
  })
})
