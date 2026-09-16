import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import BaseDropdown, { type BaseDropdownOption } from '@/components/base/BaseDropdown.vue'
import App from '@/App.vue'
import SettingsView from '@/views/SettingsView.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePanel from '@/components/base/BasePanel.vue'
import BasePopUp from '@/components/base/BasePopUp.vue'
import JobPostListPanel from '@/components/job-posts/JobPostListPanel.vue'
import OutreachContactCard from '@/components/outreach/OutreachContactCard.vue'
import ReviewSourcePanel from '@/components/review/ReviewSourcePanel.vue'
import ArrowLeftIcon from '@/components/svgs/ArrowLeftIcon.vue'
import { makeOutreachContact } from '@/test/fixtures/outreach'
import '@/assets/styles/app.scss'
import { mountVue } from '@/test/support/mount'

async function flushLayout() {
    await nextTick()
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

afterEach(async () => {
    await page.viewport(1024, 768)
})

describe('browser interaction contracts', () => {
    it('shows copy confirmation after click until it clears', async () => {
        const copied = shallowRef(false)
        const CopyButtonFixture = defineComponent({
            setup: () => () =>
                h(
                    BaseButton,
                    {
                        tooltip: copied.value ? 'Copied!' : 'Copy',
                        tooltipOpen: copied.value,
                        'aria-label': 'Copy',
                        'data-testid': 'copy-button',
                        onClick: () => {
                            copied.value = true
                        },
                    },
                    { default: () => 'Copy' },
                ),
        })
        mountVue(CopyButtonFixture)
        const button = page.getByTestId('copy-button')
        const tooltip = page.getByTestId('button-tooltip-content')

        await button.hover()
        await expect.element(tooltip).toBeVisible()

        await button.click()
        await vi.waitFor(() => expect(tooltip.element().textContent).toBe('Copied!'))
        await expect.element(tooltip).toBeVisible()

        copied.value = false
        await expect.element(tooltip).not.toBeVisible()
    })

    it('keeps dropdown keyboard focus inside its menu and restores it after selection', async () => {
        const onSelect = vi.fn()
        const options: BaseDropdownOption[] = [
            { value: 'P1', label: 'First' },
            { value: 'P2', label: 'Second' },
            { value: 'applied', label: 'Applied' },
            { value: 'clear', label: 'Clear' },
        ]
        mountVue(BaseDropdown, {
            props: {
                accessibleLabel: 'Job post label',
                disabled: false,
                label: 'Change label',
                options,
                testId: 'contract-dropdown',
                onSelect,
            },
        })
        const trigger = page.getByTestId('contract-dropdown-trigger')
        const menu = page.getByTestId('contract-dropdown-menu')
        const firstOption = page.getByTestId('contract-dropdown-option-P1')
        const lastOption = page.getByTestId('contract-dropdown-option-clear')

        trigger.element().focus()
        await userEvent.keyboard('{ArrowDown}')
        await expect.element(firstOption).toHaveFocus()

        await userEvent.keyboard('{End}')
        await expect.element(lastOption).toHaveFocus()

        await userEvent.keyboard('{Escape}')
        await expect.element(menu).not.toBeInTheDocument()
        await expect.element(trigger).toHaveFocus()

        await trigger.click()
        await page.getByTestId('contract-dropdown-option-applied').click()

        expect(onSelect).toHaveBeenCalledExactlyOnceWith('applied')
        await expect.element(menu).not.toBeInTheDocument()
        await expect.element(trigger).toHaveFocus()
    })

    it.each([320, 1024])(
        'scrolls navigation with the page and limits its width only in Settings at %ipx',
        async (width) => {
            await page.viewport(width, 768)
            vi.stubGlobal('fetch', async () => Response.json([]))
            const TallRoute = defineComponent({
                setup: () => () =>
                    h('main', {
                        'data-testid': 'route-content',
                        style: { minHeight: '200dvh' },
                    }),
            })
            const router = createRouter({
                history: createMemoryHistory(),
                routes: [
                    { path: '/', component: TallRoute },
                    { path: '/apply', component: TallRoute },
                    { path: '/track', component: TallRoute },
                    { path: '/settings', component: SettingsView },
                ],
            })
            await router.push('/')
            await router.isReady()
            mountVue(App, { install: (app) => app.use(router) })
            const header = page.getByTestId('app-header')
            const bounds = header.element().getBoundingClientRect()
            const contentBounds = page
                .getByTestId('route-content')
                .element()
                .getBoundingClientRect()
            expect(bounds.left).toBe(contentBounds.left)
            expect(bounds.right).toBe(contentBounds.right)
            expect(bounds.top).toBeGreaterThan(0)
            expect(bounds.top).toBe(bounds.left)
            expect(contentBounds.top - bounds.bottom).toBe(bounds.top)

            for (const link of page.getByRole('link').all()) {
                const rect = link.element().getBoundingClientRect()
                expect(
                    rect.left >= bounds.left &&
                        rect.right <= bounds.right &&
                        rect.top >= bounds.top &&
                        rect.bottom <= bounds.bottom,
                ).toBe(true)
            }

            page.getByTestId('nav-link-review').element().focus()
            await userEvent.keyboard('{Tab}')
            await expect.element(page.getByTestId('nav-link-apply')).toHaveFocus()
            await userEvent.keyboard('{Enter}')
            await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/apply'))
            await expect
                .element(page.getByTestId('nav-link-apply'))
                .toHaveAttribute('aria-current', 'page')

            try {
                window.scrollTo(0, 200)
                await vi.waitFor(() => expect(window.scrollY).toBe(200))
                expect(header.element().getBoundingClientRect().top).toBe(bounds.top - 200)
                window.scrollTo(0, 0)
                await vi.waitFor(() => expect(window.scrollY).toBe(0))
                await page.getByTestId('nav-link-track').click()
                await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/track'))
                await userEvent.keyboard('{Tab}')
                await expect.element(page.getByTestId('nav-link-settings')).toHaveFocus()
                await userEvent.keyboard('{Enter}')
                await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/settings'))
                await flushLayout()
                const settingsBounds = page
                    .getByTestId('resume-settings')
                    .element()
                    .getBoundingClientRect()
                const settingsHeaderBounds = header.element().getBoundingClientRect()
                expect(settingsHeaderBounds.left).toBe(settingsBounds.left)
                expect(settingsHeaderBounds.right).toBe(settingsBounds.right)

                await page.getByTestId('nav-link-review').click()
                await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
                await flushLayout()
                expect(header.element().getBoundingClientRect().width).toBe(bounds.width)
            } finally {
                window.scrollTo(0, 0)
            }
        },
    )

    it('dismisses the add-post pointer state until the button is hovered again', async () => {
        const AddJobPostFixture = defineComponent({
            setup() {
                const open = shallowRef(false)

                return () =>
                    h('div', [
                        h(ReviewSourcePanel, {
                            active: true,
                            adjacent: false,
                            reports: [],
                            selectedReportId: null,
                            userAddedSelected: false,
                            userAddedCount: 0,
                            userAddedLoading: false,
                            userAddedError: null,
                            reportsLoading: false,
                            reportsError: null,
                            onAddPost: () => {
                                open.value = true
                            },
                            onRetryReports: () => undefined,
                            onRetryUserAdded: () => undefined,
                            onSelectReport: () => undefined,
                            onSelectUserAdded: () => undefined,
                        }),
                        h(
                            BasePopUp,
                            {
                                open: open.value,
                                heading: 'Add job post',
                                closeLabel: 'Close add job post',
                                closeTestId: 'close-job-post-url-dialog',
                                'data-testid': 'job-post-url-dialog',
                                onClose: () => {
                                    open.value = false
                                },
                            },
                            {
                                default: () =>
                                    h(
                                        'form',
                                        {
                                            onSubmit: (event: SubmitEvent) => {
                                                event.preventDefault()
                                                open.value = false
                                            },
                                        },
                                        [
                                            h('input', {
                                                autofocus: true,
                                                'aria-label': 'Job post URL',
                                            }),
                                        ],
                                    ),
                            },
                        ),
                    ])
            },
        })
        mountVue(AddJobPostFixture)
        const trigger = page.getByTestId('add-job-post')
        const tooltip = page.getByTestId('button-tooltip-content')
        const dialog = page.getByTestId('job-post-url-dialog')
        const restingBackground = getComputedStyle(trigger.element()).backgroundColor

        await trigger.hover()
        await expect.element(tooltip).toBeVisible()
        const hoverBackground = getComputedStyle(trigger.element()).backgroundColor
        expect(hoverBackground).not.toBe(restingBackground)

        await trigger.click()
        await expect.element(dialog).toBeVisible()
        await expect.element(tooltip).not.toBeVisible()
        expect(getComputedStyle(trigger.element()).backgroundColor).toBe(restingBackground)

        await page.getByLabelText('Job post URL').fill('https://example.com/job')
        await userEvent.keyboard('{Enter}')
        await expect.element(dialog).not.toBeVisible()
        await expect.element(trigger).not.toHaveFocus()
        await expect.element(tooltip).not.toBeVisible()
        expect(getComputedStyle(trigger.element()).backgroundColor).toBe(restingBackground)

        await trigger.unhover()
        await trigger.hover()
        await expect.element(tooltip).toBeVisible()
        expect(getComputedStyle(trigger.element()).backgroundColor).toBe(hoverBackground)

        await trigger.click()
        await expect.element(dialog).toBeVisible()
        await userEvent.keyboard('{Escape}')
        await expect.element(dialog).not.toBeVisible()
        await expect.element(trigger).not.toHaveFocus()
        await expect.element(tooltip).not.toBeVisible()
        expect(getComputedStyle(trigger.element()).backgroundColor).toBe(restingBackground)

        await trigger.unhover()
        await trigger.hover()
        await expect.element(tooltip).toBeVisible()

        await trigger.click()
        await expect.element(dialog).toBeVisible()
        await userEvent.click(dialog, { position: { x: -8, y: -8 } })
        await expect.element(dialog).not.toBeVisible()
    })
})

describe('browser layout contracts', () => {
    it.each([
        { iconSize: undefined, height: 40 },
        { iconSize: 'sm', height: 32 },
        { iconSize: 'md', height: 36 },
        { iconSize: 'lg', height: 44 },
    ] as const)(
        'keeps button preset heights consistent with icon size $iconSize',
        async ({ iconSize, height }) => {
            const presets = ['primary', 'secondary', 'signal'] as const
            mountVue(
                defineComponent({
                    setup: () => () =>
                        h(
                            'div',
                            presets.map((preset) =>
                                h(
                                    BaseButton,
                                    { preset, iconSize, 'data-testid': `size-${preset}` },
                                    { default: () => 'Action' },
                                ),
                            ),
                        ),
                }),
            )
            await flushLayout()

            const heights = presets.map(
                (preset) =>
                    page.getByTestId(`size-${preset}`).element().getBoundingClientRect().height,
            )
            expect(heights).toEqual(presets.map(() => height))
        },
    )

    it('keeps primary button text readable at rest, on hover, and with keyboard focus', async () => {
        mountVue(
            defineComponent({
                setup: () => () =>
                    h(
                        BaseButton,
                        { 'data-testid': 'contrast-primary' },
                        { default: () => 'Action' },
                    ),
            }),
        )
        const button = page.getByTestId('contrast-primary')
        const luminance = (color: string) => {
            const channels = color
                .match(/[\d.]+/g)!
                .slice(0, 3)
                .map((value) => {
                    const channel = Number(value) / 255
                    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
                })
            return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
        }
        const contrast = () => {
            const style = getComputedStyle(button.element())
            const foreground = luminance(style.color)
            const background = luminance(style.backgroundColor)
            return (
                (Math.max(foreground, background) + 0.05) /
                (Math.min(foreground, background) + 0.05)
            )
        }

        expect(contrast()).toBeGreaterThanOrEqual(4.5)
        await button.hover()
        expect(contrast()).toBeGreaterThanOrEqual(4.5)
        await button.unhover()
        await userEvent.keyboard('{Tab}')
        await expect.element(button).toHaveFocus()
        expect(contrast()).toBeGreaterThanOrEqual(4.5)
    })

    it('anchors a back-preset tooltip to its control, keeps it inside the viewport, and dismisses it with Escape', async () => {
        await page.viewport(320, 600)
        const BackButtonFixture = defineComponent({
            setup: () => () =>
                h(
                    BaseButton,
                    {
                        preset: 'back',
                        tooltip: 'Back to the previous panel',
                        'aria-label': 'Back to the previous panel',
                        'data-testid': 'tooltip-back',
                        style: {
                            boxSizing: 'border-box',
                            paddingLeft: '120px',
                            width: '100%',
                        },
                    },
                    { default: () => h(ArrowLeftIcon) },
                ),
        })
        mountVue(BackButtonFixture, {
            style: {
                bottom: '16px',
                position: 'fixed',
                right: '0px',
                width: '320px',
            },
        })
        const button = page.getByTestId('tooltip-back')
        const tooltip = page.getByTestId('button-tooltip-content')
        const trigger = button.element().parentElement

        if (trigger === null) {
            throw new Error('Could not find tooltip trigger')
        }

        await page.elementLocator(trigger).hover()
        await expect.element(tooltip).not.toBeVisible()
        await button.hover()
        await expect.element(tooltip).toBeVisible()

        const buttonRect = button.element().getBoundingClientRect()
        await vi.waitFor(() =>
            expect(tooltip.element().getBoundingClientRect().bottom).toBeLessThan(buttonRect.top),
        )
        const tooltipRect = tooltip.element().getBoundingClientRect()
        const buttonCenter = buttonRect.left + buttonRect.width / 2
        const tooltipCenter = tooltipRect.left + tooltipRect.width / 2

        expect(button.element().getAttribute('aria-describedby')).toBe(tooltip.element().id)
        expect(Math.abs(tooltipCenter - buttonCenter)).toBeLessThanOrEqual(1)
        expect(tooltipRect.left).toBeGreaterThanOrEqual(11)
        expect(tooltipRect.right).toBeLessThanOrEqual(309)

        await userEvent.keyboard('{Escape}')
        await expect.element(tooltip).not.toBeVisible()
    })

    it('switches adjacent panels at the shared 848px breakpoint', async () => {
        await page.viewport(847, 768)
        const ResponsiveFixture = defineComponent({
            setup: () => () =>
                h('div', [
                    h(BasePanel, {
                        active: false,
                        adjacent: true,
                        'data-testid': 'adjacent-panel',
                    }),
                ]),
        })
        mountVue(ResponsiveFixture)
        const adjacentPanel = page.getByTestId('adjacent-panel')

        await expect.element(adjacentPanel).not.toBeVisible()

        await page.viewport(848, 768)

        await expect.element(adjacentPanel).toBeVisible()
    })

    it('keeps shared panel spacing below the job-post list back control', async () => {
        const { root } = mountVue(JobPostListPanel, {
            props: {
                active: true,
                adjacent: false,
                eyebrow: 'Job posts',
                title: 'Saved posts',
                backLabel: 'Back to sources',
                backTestId: 'job-post-list-back-contract',
                posts: [],
                selectedPostId: null,
                emptyMessage: 'No posts',
            },
        })
        await flushLayout()

        const backButton = page.getByTestId('job-post-list-back-contract')
        const heading = root.querySelector<HTMLElement>('[data-testid="panel-heading"]')

        if (heading === null) {
            throw new Error('Could not find panel heading')
        }

        const backButtonRect = backButton.element().getBoundingClientRect()
        const headingRect = heading.getBoundingClientRect()

        expect(headingRect.top - backButtonRect.bottom).toBeGreaterThanOrEqual(16)
    })

    it('offers rationale expansion only when real layout overflows', async () => {
        const createContact = (id: string, rationale: string) =>
            makeOutreachContact({
                id,
                jobPostId: 'post-1',
                personName: 'Contact',
                personTitle: 'Engineering leader',
                relevanceRationale: rationale,
                draftMessage: 'Draft',
            })
        const shortContact = createContact('short', 'Short rationale.')
        const longContact = createContact(
            'long',
            'This evidence-based rationale is intentionally long enough to wrap across many lines in a narrow contact card. '.repeat(
                8,
            ),
        )
        const RationaleFixture = defineComponent({
            setup: () => () =>
                h('div', { style: { display: 'grid', gap: '16px', width: '256px' } }, [
                    h(OutreachContactCard, { contact: shortContact }),
                    h(OutreachContactCard, { contact: longContact }),
                ]),
        })
        mountVue(RationaleFixture)
        await flushLayout()

        const shortCard = page.getByTestId('outreach-contact-short')
        const longCard = page.getByTestId('outreach-contact-long')
        const shortToggle = shortCard.getByTestId('outreach-contact-rationale-toggle')
        const longToggle = longCard.getByTestId('outreach-contact-rationale-toggle')
        const rationale = longCard.getByTestId('outreach-contact-rationale')
        const clampedRationale = rationale.element()

        await expect.element(shortToggle).not.toBeInTheDocument()
        await expect.element(longToggle).toBeInTheDocument()
        expect(clampedRationale.scrollHeight).toBeGreaterThan(clampedRationale.clientHeight)

        await longToggle.click()
        await expect.element(longToggle).toHaveAttribute('aria-expanded', 'true')
        await flushLayout()

        const expandedRationale = rationale.element()
        expect(expandedRationale.scrollHeight - expandedRationale.clientHeight).toBeLessThanOrEqual(
            1,
        )
    })
})
