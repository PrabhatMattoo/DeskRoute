import type {
  CallOutcome,
  EscalationStatus,
  AppointmentStatus,
} from '@receptionist/shared'

/** Four roles, two of them coloured: `waiting` takes the accent and `failed`
 *  takes red, which is used for nothing else. */
export type StatusTone = 'fact' | 'waiting' | 'quiet' | 'failed'

const toneClasses: Record<StatusTone, string> = {
  fact: 'text-foreground font-medium',
  waiting: 'text-accent-ink font-medium',
  quiet: 'text-muted-foreground',
  failed: 'text-destructive font-medium',
}

export function toneToClasses(tone: StatusTone): string {
  return toneClasses[tone]
}

export type StatusEntry = { label: string; tone: StatusTone }

export const callOutcomeConfig: Record<CallOutcome, StatusEntry> = {
  booked: { label: 'Booked', tone: 'fact' },
  escalated: { label: 'Escalated', tone: 'waiting' },
  answered: { label: 'Answered', tone: 'quiet' },
  abandoned: { label: 'Abandoned', tone: 'quiet' },
  error: { label: 'Error', tone: 'failed' },
}

export const appointmentStatusConfig: Record<AppointmentStatus, StatusEntry> = {
  confirmed: { label: 'Confirmed', tone: 'fact' },
  requested: { label: 'Requested', tone: 'waiting' },
  cancelled: { label: 'Cancelled', tone: 'quiet' },
}

export const escalationStatusConfig: Record<EscalationStatus, StatusEntry> = {
  pending: { label: 'Pending', tone: 'waiting' },
  resolved: { label: 'Resolved', tone: 'quiet' },
}
