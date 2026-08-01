import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import BaseDropdown, { type BaseDropdownOption } from '@/components/base/BaseDropdown.vue'
import AppHeader from '@/components/AppHeader.vue'
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

    it('makes retracted navigation operable by pointer and keyboard', async () => {
        const EmptyRoute = defineComponent({ setup: () => () => h('div') })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', component: EmptyRoute },
                { path: '/apply', component: EmptyRoute },
                { path: '/results', component: EmptyRoute },
            ],
        })
        await router.push('/')
        await router.isReady()
        mountVue(AppHeader, { install: (app) => app.use(router) })
        const trigger = page.getByTestId('app-nav-trigger')
        const applyLink = page.getByTestId('nav-link-apply')

        applyLink.element().focus()
        await expect.element(applyLink).not.toHaveFocus()

        await trigger.hover()
        await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
        await trigger.unhover()
        await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')

        trigger.element().focus()
        await userEvent.keyboard('{Enter}')
        await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')

        applyLink.element().focus()
        await expect.element(applyLink).toHaveFocus()
        await userEvent.keyboard('{Escape}')
        await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
        await expect.element(trigger).toHaveFocus()
    })

    it('closes navigation after following a route without hiding the focused link', async () => {
        const EmptyRoute = defineComponent({ setup: () => () => h('div') })
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', component: EmptyRoute },
                { path: '/apply', component: EmptyRoute },
                { path: '/results', component: EmptyRoute },
            ],
        })
        await router.push('/')
        await router.isReady()
        const { root } = mountVue(AppHeader, { install: (app) => app.use(router) })
        const trigger = page.getByTestId('app-nav-trigger')
        let hidFocusedElement = false
        const ariaHiddenObserver = new MutationObserver((records) => {
            for (const { target } of records) {
                if (
                    target instanceof HTMLElement &&
                    target.getAttribute('aria-hidden') === 'true' &&
                    target.contains(document.activeElement)
                ) {
                    hidFocusedElement = true
                }
            }
        })
        ariaHiddenObserver.observe(root, {
            attributeFilter: ['aria-hidden'],
            attributes: true,
            subtree: true,
        })

        try {
            await trigger.hover()
            await page.getByTestId('nav-link-apply').click()

            await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/apply'))
            await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
        } finally {
            ariaHiddenObserver.disconnect()
        }

        expect(hidFocusedElement).toBe(false)
    })

    it('keeps the add-post tooltip hidden when its dialog restores trigger focus', async () => {
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
                                    h('input', {
                                        autofocus: true,
                                        'aria-label': 'Job post URL',
                                    }),
                            },
                        ),
                    ])
            },
        })
        mountVue(AddJobPostFixture)
        const trigger = page.getByTestId('add-job-post')
        const tooltip = page.getByTestId('button-tooltip-content')
        const dialog = page.getByTestId('job-post-url-dialog')

        await trigger.hover()
        await expect.element(tooltip).toBeVisible()
        await trigger.click()
        await expect.element(dialog).toBeVisible()
        await expect.element(tooltip).not.toBeVisible()

        await page.getByTestId('close-job-post-url-dialog').click()
        await expect.element(dialog).not.toBeVisible()
        await expect.element(trigger).toHaveFocus()
        await expect.element(tooltip).not.toBeVisible()
    })
})

describe('browser layout contracts', () => {
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

        button.element().focus()
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
