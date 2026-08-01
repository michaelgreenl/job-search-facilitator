/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import BaseCard from '@/components/base/BaseCard.vue'
import { mountVue } from '@/test/support/mount'

describe('BaseCard', () => {
    it('forwards clicks from button cards with a non-submit type', () => {
        const onClick = vi.fn()
        const { root } = mountVue(BaseCard, { props: { as: 'button', onClick } })

        const card = root.querySelector<HTMLButtonElement>('button')

        if (card === null) {
            throw new Error('Could not mount button card')
        }

        expect(card.type).toBe('button')
        card.click()
        expect(onClick).toHaveBeenCalledOnce()
    })
})
