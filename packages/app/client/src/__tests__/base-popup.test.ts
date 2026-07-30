/** @vitest-environment jsdom */

import { createApp, defineComponent, h, nextTick, shallowRef, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BasePopUp from '@/components/base/BasePopUp.vue'

interface MountedPopUp {
    app: App
    dialog: HTMLDialogElement
    error: ReturnType<typeof shallowRef<string | null>>
    onClose: ReturnType<typeof vi.fn>
    open: ReturnType<typeof shallowRef<boolean>>
    root: HTMLElement
}

const mountedPopUps: MountedPopUp[] = []
const nativeShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const nativeClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')

function mountPopUp(initiallyOpen = true) {
    const open = shallowRef(initiallyOpen)
    const error = shallowRef<string | null>(null)
    const onClose = vi.fn(() => {
        open.value = false
    })
    const root = document.createElement('div')

    document.body.append(root)

    const app = createApp(
        defineComponent({
            setup() {
                return () =>
                    h(
                        BasePopUp,
                        {
                            open: open.value,
                            heading: 'Pop-up heading',
                            error: error.value,
                            errorTestId: 'pop-up-error',
                            closeTestId: 'close-pop-up',
                            'data-testid': 'base-pop-up',
                            onClose,
                        },
                        {
                            default: ({ errorId }: { errorId: string }) =>
                                h('input', {
                                    'aria-describedby': error.value ? errorId : undefined,
                                    'data-testid': 'pop-up-input',
                                }),
                        },
                    )
            },
        }),
    )

    app.mount(root)

    const dialog = root.querySelector<HTMLDialogElement>('[data-testid="base-pop-up"]')

    if (dialog === null) {
        throw new Error('Could not mount the base pop-up')
    }

    const mounted = { app, dialog, error, onClose, open, root }
    mountedPopUps.push(mounted)

    return mounted
}

describe('BasePopUp', () => {
    beforeEach(() => {
        Object.defineProperties(HTMLDialogElement.prototype, {
            showModal: {
                configurable: true,
                value(this: HTMLDialogElement) {
                    this.setAttribute('open', '')
                },
            },
            close: {
                configurable: true,
                value(this: HTMLDialogElement) {
                    this.removeAttribute('open')
                    this.dispatchEvent(new Event('close'))
                },
            },
        })
    })

    afterEach(() => {
        for (const { app, root } of mountedPopUps.splice(0)) {
            app.unmount()
            root.remove()
        }

        if (nativeShowModal === undefined) {
            Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
        } else {
            Object.defineProperty(HTMLDialogElement.prototype, 'showModal', nativeShowModal)
        }

        if (nativeClose === undefined) {
            Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
        } else {
            Object.defineProperty(HTMLDialogElement.prototype, 'close', nativeClose)
        }
    })

    it('syncs its native open state and requests close through its controlled contract', async () => {
        const { dialog, onClose, open, root } = mountPopUp(false)

        expect(dialog.open).toBe(false)

        open.value = true
        await nextTick()

        expect(dialog.open).toBe(true)

        const closeButton = root.querySelector<HTMLButtonElement>('[data-testid="close-pop-up"]')

        if (closeButton === null) {
            throw new Error('Could not find the pop-up close button')
        }

        closeButton.click()
        await nextTick()

        expect(onClose).toHaveBeenCalledOnce()
        expect(dialog.open).toBe(false)

        open.value = true
        await nextTick()
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
        await nextTick()

        expect(onClose).toHaveBeenCalledTimes(2)
        expect(dialog.open).toBe(false)
    })

    it('renders slotted body content and connects it to the error prop', async () => {
        const { error, root } = mountPopUp()
        const input = root.querySelector<HTMLInputElement>('[data-testid="pop-up-input"]')

        expect(input).not.toBeNull()
        expect(root.querySelector('[data-testid="pop-up-error"]')).toBeNull()

        error.value = 'Could not complete the action.'
        await nextTick()

        const errorMessage = root.querySelector<HTMLElement>('[data-testid="pop-up-error"]')

        expect(errorMessage).not.toBeNull()
        expect(input?.getAttribute('aria-describedby')).toBe(errorMessage?.id)
    })
})
