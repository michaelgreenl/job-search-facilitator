import { afterEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Resume } from '@job-search-facilitator/core'
import SettingsView from '@/views/SettingsView.vue'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

afterEach(async () => page.viewport(1024, 768))

it.each([320, 656, 1024])(
    'keeps resume actions reachable beside long names at %ipx',
    async (width) => {
        await page.viewport(width, 768)
        const resume: Resume = {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'M'.repeat(120),
            uploads: [
                {
                    id: '22222222-2222-4222-8222-222222222222',
                    fileName: 'resume.pdf',
                    sizeBytes: 10,
                    uploadedAt: '2026-09-13T12:00:00Z',
                },
            ],
        }
        vi.stubGlobal('fetch', async (url: string) =>
            Response.json(url.endsWith('/automations') ? [] : [resume]),
        )
        mountVue(SettingsView)
        const row = page.getByTestId(`resume-${resume.id}`)
        await expect.element(row).toBeVisible()
        const rowBounds = row.element().getBoundingClientRect()
        const details = page.getByTestId(`details-${resume.id}`).element().getBoundingClientRect()
        const actions = ['open', 'download', 'upload'].map((action) =>
            page.getByTestId(`${action}-${resume.id}`),
        )
        const bounds = actions.map((action) => action.element().getBoundingClientRect())

        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth)
        for (const [index, action] of bounds.entries()) {
            expect(action.width).toBeGreaterThanOrEqual(width === 320 ? 44 : 36)
            expect(action.height).toBeGreaterThanOrEqual(width === 320 ? 44 : 36)
            expect(action.left).toBeGreaterThanOrEqual(
                index ? bounds[index - 1]!.right : rowBounds.left,
            )
            expect(action.right).toBeLessThanOrEqual(rowBounds.right)
            expect(action.bottom).toBeLessThanOrEqual(rowBounds.bottom)
        }
        if (width === 320) expect(bounds[0]!.top).toBeGreaterThanOrEqual(details.bottom)
        else expect(bounds[0]!.left).toBeGreaterThanOrEqual(details.right)
        expect(
            page.getByTestId('add-resume').element().getBoundingClientRect().top,
        ).toBeGreaterThanOrEqual(rowBounds.bottom)

        actions[0]!.element().focus()
        for (const [index, action] of actions.entries()) {
            if (index) await userEvent.keyboard('{Tab}')
            await expect.element(action).toHaveFocus()
            const tooltip = document.getElementById(
                action.element().getAttribute('aria-describedby')!,
            )!
            await expect.element(tooltip).toBeVisible()
            await userEvent.keyboard('{Escape}')
            await expect.element(tooltip).not.toBeVisible()
        }
        await userEvent.keyboard('{Enter}')
        await expect.element(page.getByTestId('resume-upload-dialog')).toBeVisible()
        await userEvent.keyboard('{Escape}')
        await expect.element(actions[2]!).toHaveFocus()
    },
)

it('saves named PDFs, keeps earlier upload links in an accessible popup, and preserves a failed upload for retry', async () => {
    const resumeId = '11111111-1111-4111-8111-111111111111'
    const firstId = '22222222-2222-4222-8222-222222222222'
    const secondId = '33333333-3333-4333-8333-333333333333'
    let saved: Resume | null = null
    let failUpload = false
    const sent: { path: string; fileName: string | null; content: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        if (!init) return Response.json([])
        const file = init.body as File
        sent.push({
            path: new URL(url).pathname + new URL(url).search,
            fileName: new Headers(init.headers).get('X-Artifact-Filename'),
            content: await file.text(),
        })
        if (failUpload)
            return Response.json({ error: 'Upload unavailable. Try again.' }, { status: 503 })
        saved = {
            id: resumeId,
            name: 'Product engineering',
            uploads: [
                {
                    id: saved ? secondId : firstId,
                    fileName: file.name,
                    sizeBytes: file.size,
                    uploadedAt: saved ? '2026-09-14T12:00:00Z' : '2026-09-13T12:00:00Z',
                },
                ...(saved?.uploads ?? []),
            ],
        }
        return Response.json(saved)
    })
    mountVue(SettingsView)
    await page.getByTestId('add-resume').click()
    await page.getByTestId('resume-name').fill('Product engineering')
    await page
        .getByTestId('resume-file')
        .upload(new File(['%PDF-first'], 'first.pdf', { type: 'application/pdf' }))
    await page.getByTestId('save-resume').click()
    await expect.element(page.getByTestId(`resume-${resumeId}`)).toBeVisible()
    await expect.element(page.getByTestId(`history-${resumeId}`)).toBeDisabled()
    await page.getByTestId(`upload-${resumeId}`).click()
    await page
        .getByTestId('resume-file')
        .upload(new File(['%PDF-current'], 'current.pdf', { type: 'application/pdf' }))
    failUpload = true
    await page.getByTestId('save-resume').click()
    await expect.element(page.getByTestId('resume-upload-dialog').getByRole('alert')).toBeVisible()
    expect((page.getByTestId('resume-file').element() as HTMLInputElement).files?.[0]?.name).toBe(
        'current.pdf',
    )
    failUpload = false
    await page.getByTestId('save-resume').click()
    await expect.element(page.getByTestId('resume-upload-dialog')).not.toBeVisible()
    expect(sent).toEqual([
        {
            path: '/api/resumes?name=Product%20engineering',
            fileName: 'first.pdf',
            content: '%PDF-first',
        },
        {
            path: `/api/resumes/${resumeId}/uploads`,
            fileName: 'current.pdf',
            content: '%PDF-current',
        },
        {
            path: `/api/resumes/${resumeId}/uploads`,
            fileName: 'current.pdf',
            content: '%PDF-current',
        },
    ])
    await page.viewport(360, 640)
    const historyTrigger = page.getByTestId(`history-${resumeId}`)
    await expect.element(historyTrigger).toBeEnabled()
    await historyTrigger.click()
    const dialog = page.getByTestId('resume-history-dialog')
    await expect.element(dialog).toBeVisible()
    const links = Array.from(dialog.element().getElementsByTagName('a'))
    expect(links.map((link) => ({ href: link.getAttribute('href'), target: link.target }))).toEqual(
        [
            { href: `http://127.0.0.1:3000/api/resumes/uploads/${firstId}`, target: '_blank' },
            {
                href: `http://127.0.0.1:3000/api/resumes/uploads/${firstId}?download=true`,
                target: '',
            },
        ],
    )
    const bounds = dialog.element().getBoundingClientRect()
    expect(
        bounds.left >= 0 &&
            bounds.right <= innerWidth &&
            bounds.top >= 0 &&
            bounds.bottom <= innerHeight,
    ).toBe(true)
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeVisible()
    await expect.element(historyTrigger).toHaveFocus()
})

it('does not treat a failed library load as an empty library and allows recovery', async () => {
    const fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Offline'))
        .mockResolvedValueOnce(Response.json([]))
    vi.stubGlobal('fetch', (url: string) =>
        url.endsWith('/automations') ? Promise.resolve(Response.json([])) : fetch(),
    )
    mountVue(SettingsView)
    await expect.element(page.getByRole('alert')).toBeVisible()
    await expect.element(page.getByTestId('add-resume')).toBeDisabled()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(page.getByTestId('add-resume')).toBeEnabled()
})
