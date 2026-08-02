/** @vitest-environment jsdom */

import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import BasePanel from '@/components/base/BasePanel.vue'
import { mountVue } from '@/test/support/mount'

describe('BasePanel', () => {
    it('keeps its back control and slotted controls wired independently', () => {
        const onBack = vi.fn()
        const onExtraControl = vi.fn()
        const Fixture = defineComponent({
            setup: () => () =>
                h(
                    BasePanel,
                    {
                        active: true,
                        adjacent: false,
                        backLabel: 'Back',
                        backMobileOnly: true,
                        backTestId: 'panel-back',
                        onBack,
                    },
                    {
                        controls: () =>
                            h('button', {
                                'data-testid': 'panel-extra-control',
                                type: 'button',
                                onClick: onExtraControl,
                            }),
                    },
                ),
        })
        const { root } = mountVue(Fixture)
        const back = root.querySelector<HTMLButtonElement>('[data-testid="panel-back"]')
        const extraControl = root.querySelector<HTMLButtonElement>(
            '[data-testid="panel-extra-control"]',
        )

        expect(back).not.toBeNull()
        expect(extraControl).not.toBeNull()

        back?.click()
        extraControl?.click()

        expect(onBack).toHaveBeenCalledOnce()
        expect(onExtraControl).toHaveBeenCalledOnce()
    })
})
