/** @vitest-environment jsdom */

import { createApp, defineComponent, h, nextTick, shallowRef, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JobPostUrlDialog from '@/components/review/JobPostUrlDialog.vue'

interface MountedDialog {
    app: App
    dialog: HTMLDialogElement
    onClose: ReturnType<typeof vi.fn>
    onSubmit: ReturnType<typeof vi.fn>
    open: ReturnType<typeof shallowRef<boolean>>
    root: HTMLElement
    url: ReturnType<typeof shallowRef<string>>
}

const mountedDialogs: MountedDialog[] = []
const nativeShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const nativeClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')

function mountDialog(initiallyOpen = true) {
    const open = shallowRef(initiallyOpen)
    const url = shallowRef('')
    const onClose = vi.fn(() => {
        open.value = false
    })
    const onSubmit = vi.fn()
    const root = document.createElement('div')

    document.body.append(root)

    const app = createApp(
        defineComponent({
            setup() {
                return () =>
                    h(JobPostUrlDialog, {
                        open: open.value,
                        url: url.value,
                        'onUpdate:url': (value: string) => {
                            url.value = value
                        },
                        onClose,
                        onSubmit,
                    })
            },
        }),
    )

    app.mount(root)

    const dialog = root.querySelector<HTMLDialogElement>('[data-testid="job-post-url-dialog"]')

    if (dialog === null) {
        throw new Error('Could not mount the job-post URL dialog')
    }

    const mounted = { app, dialog, onClose, onSubmit, open, root, url }
    mountedDialogs.push(mounted)

    return mounted
}

function setUrl(root: HTMLElement, value: string) {
    const input = root.querySelector<HTMLInputElement>('[data-testid="job-post-url"]')

    if (input === null) {
        throw new Error('Could not find the job-post URL input')
    }

    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

function submit(root: HTMLElement) {
    const form = root.querySelector<HTMLFormElement>('[data-testid="job-post-url-form"]')

    if (form === null) {
        throw new Error('Could not find the job-post URL form')
    }

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

describe('JobPostUrlDialog', () => {
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
        for (const { app, root } of mountedDialogs.splice(0)) {
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
        const { dialog, onClose, open, root } = mountDialog(false)

        expect(dialog.open).toBe(false)

        open.value = true
        await nextTick()

        expect(dialog.open).toBe(true)

        const closeButton = root.querySelector<HTMLButtonElement>(
            '[data-testid="close-job-post-url-dialog"]',
        )

        if (closeButton === null) {
            throw new Error('Could not find the dialog close button')
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

    it('updates the controlled URL and emits a normalized HTTP URL on submit', async () => {
        const { onSubmit, root, url } = mountDialog()

        setUrl(root, 'HTTPS://EXAMPLE.COM/jobs/123')
        await nextTick()
        submit(root)

        expect(url.value).toBe('HTTPS://EXAMPLE.COM/jobs/123')
        expect(onSubmit).toHaveBeenCalledExactlyOnceWith('https://example.com/jobs/123')
    })

    it('rejects a non-HTTP URL without submitting it', async () => {
        const { onSubmit, root } = mountDialog()

        setUrl(root, 'javascript:alert(1)')
        await nextTick()
        submit(root)
        await nextTick()

        expect(onSubmit).not.toHaveBeenCalled()
        expect(root.querySelector('[data-testid="job-post-url-error"]')).not.toBeNull()
    })
})
