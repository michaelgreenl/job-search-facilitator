import { USER_LABELS, type UserLabel } from '@job-search-facilitator/core'
import type { AppDropdownOption, AppDropdownTone } from '@/components/app/AppDropdown.vue'

export const USER_LABEL_TONES = {
    P1: 'priority-high',
    P2: 'priority-medium',
    'quick-app': 'quick',
    forgo: 'muted',
} satisfies Record<UserLabel, AppDropdownTone>

export const USER_LABEL_OPTIONS: AppDropdownOption[] = USER_LABELS.map((label) => ({
    value: label,
    label,
    tone: USER_LABEL_TONES[label],
}))

export const getUserLabelTone = (label: UserLabel) => USER_LABEL_TONES[label]
