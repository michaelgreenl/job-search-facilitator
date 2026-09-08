/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import SettingsView from '@/views/SettingsView.vue'
import { jsonResponse, requestParts } from '@/test/support/http'
import { mountVue } from '@/test/support/mount'

const readRequestBody = (body: BodyInit | null | undefined) => {
    if (typeof body !== 'string') {
        throw new Error('Expected a JSON request body')
    }

    return JSON.parse(body) as { sections: Array<{ title: string; content: string }> }
}

describe('settings view', () => {
    it('saves edited profile sections', async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            const { method, url } = requestParts(input, init)

            if (method === 'GET' && url.endsWith('/settings')) {
                return Promise.resolve(
                    jsonResponse({
                        sections: [{ title: 'Target work', content: 'Frontend roles.' }],
                        resumes: [],
                    }),
                )
            }

            if (method === 'PUT' && url.endsWith('/settings')) {
                return Promise.resolve(
                    jsonResponse({
                        sections: readRequestBody(init?.body).sections,
                        resumes: [],
                    }),
                )
            }

            throw new Error(`Unexpected ${method} request: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)
        const { root } = mountVue(SettingsView)

        await vi.waitFor(() =>
            expect(
                root.querySelector<HTMLTextAreaElement>('[data-testid="settings-section-0"]'),
            ).not.toBeNull(),
        )
        const field = root.querySelector<HTMLTextAreaElement>('[data-testid="settings-section-0"]')!
        field.value = 'Frontend and full-stack roles.'
        field.dispatchEvent(new Event('input', { bubbles: true }))
        root.querySelector<HTMLButtonElement>('[data-testid="save-settings"]')!.click()

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
        expect(readRequestBody(fetchMock.mock.calls[1]![1]?.body)).toEqual({
            sections: [{ title: 'Target work', content: 'Frontend and full-stack roles.' }],
        })
    })
})
