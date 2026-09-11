import { defineComponent, h, shallowRef } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import BasePanel from '@/components/base/BasePanel.vue'
import OutreachDraft from '@/components/outreach/OutreachDraft.vue'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import { mountVue } from '@/test/support/mount'
import '@/assets/styles/app.scss'

afterEach(() => page.viewport(1024, 768))

it.each([390, 1280])(
    'keeps a long draft conversation and its controls usable at %ipx',
    async (width) => {
        await page.viewport(width, 768)
        const draft = shallowRef('My current message')
        const request = shallowRef('An unsent follow-up')
        const running = shallowRef(false)
        const issue = shallowRef<string | null>(
            'The agent returned an invalid result. Your draft is intact.',
        )
        const onRetry = vi.fn(() => {
            issue.value = null
            running.value = true
        })
        const onSubmit = vi.fn()
        const exchanges = Array.from({ length: 5 }, (_, index) => ({
            taskId: String(index),
            request: `Refine the question for this recipient. ${'Keep it grounded in the role. '.repeat(3)}`,
            response:
                'This version asks about their team’s current work and preserves your direct tone.',
            draft: `Hi Ada,\n\n${'I would like to hear more about how your team builds and tests accessible interfaces. '.repeat(3)}\n\nMichael`,
        }))
        const Fixture = defineComponent({
            setup: () => () =>
                h(
                    BasePanel,
                    {
                        active: true,
                        adjacent: false,
                        as: 'aside',
                        eyebrow: 'Outreach',
                        backLabel: 'Back to contacts',
                    },
                    {
                        default: () =>
                            h(OutreachDraft, {
                                contact: makeOutreachContact(),
                                draft: draft.value,
                                request: request.value,
                                exchanges,
                                running: running.value,
                                requestingChanges: running.value,
                                copyState: 'idle',
                                canSave: true,
                                saving: false,
                                expanded: width > 1000,
                                issue: issue.value,
                                retryAvailable: issue.value !== null,
                                messagedError: null,
                                messagedUpdating: false,
                                reconnecting: false,
                                'onUpdate:draft': (value: string) => {
                                    draft.value = value
                                },
                                'onUpdate:request': (value: string) => {
                                    request.value = value
                                },
                                onUseDraft: (id: string) => {
                                    draft.value = exchanges.find(
                                        (item) => item.taskId === id,
                                    )!.draft
                                },
                                onRetry,
                                onSubmit,
                            }),
                    },
                ),
        })
        const { root } = mountVue(Fixture, {
            style: { display: 'flex', height: '96dvh', maxWidth: '76rem', margin: '0 auto' },
        })
        const log = page.getByTestId('outreach-conversation')
        const composer = page.getByTestId('outreach-draft-request')
        await vi.waitFor(() => {
            const bounds = log.element().getBoundingClientRect()
            const inputBounds = composer.element().getBoundingClientRect()
            expect(bounds.height).toBeGreaterThan(75)
            expect(bounds.bottom).toBeLessThanOrEqual(inputBounds.top)
            expect(inputBounds.bottom).toBeLessThanOrEqual(root.getBoundingClientRect().bottom)
            expect(root.scrollWidth).toBeLessThanOrEqual(width)
        })
        await page.getByTestId('use-outreach-draft-4').click()
        await expect.element(page.getByTestId('outreach-message')).toHaveValue(exchanges[4]!.draft)
        await page.getByTestId('outreach-draft-retry').click()
        await expect.element(page.getByTestId('outreach-draft-issue')).not.toBeInTheDocument()
        await expect.element(page.getByTestId('outreach-draft-stop')).toBeVisible()
        await page.getByTestId('outreach-message').fill('I can still edit during a request')
        expect(draft.value).toBe('I can still edit during a request')
    },
)
