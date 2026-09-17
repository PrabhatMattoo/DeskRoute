/** In the business's timezone, because the agent quotes callers in `agents.timezone`. */

/** US/CA E.164. Numbers from other regions fall through to their raw string. */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return e164
}

export function formatDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  })
}

export function formatTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return `${formatDate(iso, timeZone)} ${formatTime(iso, timeZone)}`
}

/** The day a moment falls on in a given zone, as `YYYY-MM-DD`. */
export function dayKey(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone })
}

/** "Today", "Yesterday", or the weekday and date. */
export function relativeDay(iso: string, timeZone?: string, now = new Date()): string {
  const key = dayKey(iso, timeZone)
  if (key === dayKey(now.toISOString(), timeZone)) return 'Today'
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (key === dayKey(yesterday.toISOString(), timeZone)) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone,
  })
}

/** "1m 23s" or "45s". Null while a call is still running. */
export function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return null
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m === 0 ? `${s}s` : `${m}m ${s}s`
}

/**
 * The word a duration is written in, wherever it is read or edited. Abbreviated
 * where English abbreviates, spelled out where it does not.
 */
export const UNIT = {
  minutes: 'min',
  hours: 'hr',
  days: 'days',
} as const

export type Unit = (typeof UNIT)[keyof typeof UNIT]

/** "45 min", "2 hr", "1 hr 30 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} ${UNIT.minutes}`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} ${UNIT.hours}` : `${h} ${UNIT.hours} ${m} ${UNIT.minutes}`
}

/** Name, then number, then "Unknown caller". "No caller ID" is a different fact
 *  and is said where the number stands alone. */
export function formatCaller(
  name: string | null | undefined,
  phone: string | null | undefined,
): string {
  const n = name?.trim()
  if (n && phone) return `${n} · ${formatPhone(phone)}`
  if (n) return n
  if (phone) return formatPhone(phone)
  return 'Unknown caller'
}

/** Digits only, never NaN: the value becomes an appointment length downstream. */
export function digitsToNumber(raw: string): number {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return 0
  const n = Number(digits)
  return Number.isFinite(n) ? n : 0
}
