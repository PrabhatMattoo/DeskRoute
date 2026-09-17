import type { AppSettings } from '@/lib/settings-types'

export interface SetupItem {
  id: 'services' | 'hours' | 'calendar'
  title: string
  description: string
  minutes: string
  action: string
  to: string
  done: boolean
}

/**
 * The three things between answering a phone and booking on it. Hours are valid
 * from creation, so only `hoursSeen` says whether they have been looked at.
 */
export function setupItems(settings: AppSettings): SetupItem[] {
  return [
    {
      id: 'services',
      title: 'Add your services',
      description:
        'Your agent quotes and books from this list, so a caller can book only what it holds.',
      minutes: '2 min',
      action: 'Add services',
      to: '/settings?tab=business',
      done: settings.business.services.length > 0,
    },
    {
      id: 'hours',
      title: 'Set your opening hours',
      description:
        'They start at Monday to Friday, nine to five. Change them if that is not you.',
      minutes: '1 min',
      action: 'Check hours',
      to: '/settings?tab=hours',
      done: settings.setup.hoursSeen,
    },
    {
      id: 'calendar',
      title: 'Connect your calendar',
      description:
        'Your agent reads it before offering a time, and writes the booking into it.',
      minutes: '1 min',
      action: 'Connect',
      to: '/settings?tab=connections',
      done: Boolean(settings.business.calendarExternalId),
    },
  ]
}
