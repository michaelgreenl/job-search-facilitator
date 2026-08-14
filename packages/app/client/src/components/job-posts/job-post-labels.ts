import { USER_LABELS, type ApplicationStatus, type UserLabel } from '@job-search-facilitator/core'
import type { BaseDropdownOption, BaseDropdownTone } from '@/components/base/BaseDropdown.vue'

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
    'not-applied': 'Not applied',
    'awaiting-response': 'Awaiting response',
    interviewing: 'Interviewing',
    rejected: 'Rejected',
    hired: 'Job Offer',
}

export const USER_LABEL_TONES = {
    P1: 'priority-high',
    P2: 'priority-medium',
    'quick-app': 'quick',
    forgo: 'muted',
} satisfies Record<UserLabel, BaseDropdownTone>

export const USER_LABEL_OPTIONS: BaseDropdownOption[] = USER_LABELS.map((label) => ({
    value: label,
    label,
    tone: USER_LABEL_TONES[label],
}))

export const getUserLabelTone = (label: UserLabel) => USER_LABEL_TONES[label]
