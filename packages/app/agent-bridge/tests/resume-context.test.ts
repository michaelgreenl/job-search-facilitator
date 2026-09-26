import { afterEach, expect, it, vi } from 'vitest'
import { loadResumeContext } from '../src/resume-context.ts'

afterEach(() => vi.unstubAllGlobals())

// A real, tiny PDF keeps extraction in the test instead of mocking the PDF reader.
function pdf(text: string) {
    const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ]
    let document = '%PDF-1.4\n'
    const offsets = objects.map((object, index) => {
        const offset = document.length
        document += `${index + 1} 0 obj\n${object}\nendobj\n`
        return offset
    })
    const start = document.length
    document += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
    return document
}

it('reads only the current PDF for each named resume before producing agent context', async () => {
    const currentPdf = pdf('Current verified TypeScript experience')
    const latestId = '11111111-1111-4111-8111-111111111111'
    const oldId = '22222222-2222-4222-8222-222222222222'
    const requested: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
        requested.push(url)
        if (url.endsWith('/health'))
            return Response.json({ status: 'healthy', capabilities: { resumeLibrary: 1 } })
        if (url.endsWith('/resumes'))
            return Response.json([
                {
                    id: latestId,
                    name: 'Product engineer',
                    uploads: [latestId, oldId].map((id) => ({
                        id,
                        fileName: 'resume.pdf',
                        sizeBytes: currentPdf.length,
                        uploadedAt: '2026-09-14T12:00:00Z',
                    })),
                },
            ])
        if (url.endsWith(latestId)) return new Response(currentPdf)
        throw new Error('An old upload must not be read')
    })
    const context = await loadResumeContext('http://127.0.0.1:3999/api')
    expect(JSON.parse(context.slice(context.lastIndexOf('\n') + 1))).toEqual([
        {
            name: 'Product engineer',
            uploadedAt: '2026-09-14T12:00:00Z',
            text: 'Current verified TypeScript experience',
        },
    ])
    expect(requested).not.toContain(`http://127.0.0.1:3999/api/resumes/uploads/${oldId}`)
})

it('keeps legacy behavior for an empty library or old API, but stops on a broken library', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    fetch.mockResolvedValueOnce(Response.json({ status: 'healthy', capabilities: {} }))
    await expect(loadResumeContext()).resolves.toBe('')
    fetch
        .mockResolvedValueOnce(
            Response.json({ status: 'healthy', capabilities: { resumeLibrary: 1 } }),
        )
        .mockResolvedValueOnce(Response.json([]))
    await expect(loadResumeContext()).resolves.toBe('')
    fetch
        .mockResolvedValueOnce(
            Response.json({ status: 'healthy', capabilities: { resumeLibrary: 1 } }),
        )
        .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
    await expect(loadResumeContext()).rejects.toThrow('503')
})
