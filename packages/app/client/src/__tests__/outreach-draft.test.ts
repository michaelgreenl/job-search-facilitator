/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import OutreachDraft from '@/components/outreach/OutreachDraft.vue'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { mountVue } from '@/test/support/mount'

describe('OutreachDraft', () => {
    it('submits a change request when Enter is pressed', () => {
        const onSubmit = vi.fn()
        const { root } = mountVue(OutreachDraft, {
            props: {
                contact: makeOutreachContact(),
                draft: 'Current draft',
                request: 'Make it warmer',
                assistantReply: null,
                running: false,
                requestingChanges: false,
                copyState: 'idle',
                canSave: false,
                saving: false,
                expanded: false,
                issue: null,
                messagedError: null,
                messagedUpdating: false,
                reconnecting: false,
                onSubmit,
            },
        })
        const request = root.querySelector('[data-testid="outreach-draft-request"]')

        request?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))

        expect(onSubmit).toHaveBeenCalledOnce()
    })
})
