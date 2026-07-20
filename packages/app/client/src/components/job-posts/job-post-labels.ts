import { USER_LABELS, type UserLabel } from '@job-search-facilitator/core'
import type { ActionMenuItem, ActionMenuTone } from '@/components/app/ActionMenu.vue'

export const USER_LABEL_TONES = {
    P1: 'priority-high',
    P2: 'priority-medium',
    'quick-app': 'quick',
    forgo: 'muted',
} satisfies Record<UserLabel, ActionMenuTone>

export const USER_LABEL_ACTIONS: ActionMenuItem[] = USER_LABELS.map((label) => ({
    value: label,
    label,
    tone: USER_LABEL_TONES[label],
}))

export const getUserLabelTone = (label: UserLabel) => USER_LABEL_TONES[label]
