import { useState } from 'react'
import { useUser } from '@clerk/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Phone } from 'lucide-react'
import { toast } from 'sonner'
import type { CalendarOption } from '@receptionist/shared'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { apiClient } from '@/lib/apiClient'
import { keys, fetchers } from '@/lib/queries'
import { formatPhone } from '@/lib/formatters'
import type { AppSettings } from '@/lib/settings-types'
import { cn } from '@/lib/utils'
import { Section, SubRow, MEASURE } from './SettingsList'

type Open = 'phone' | 'calendar' | null

function ConnectionRow({
  icon: Icon,
  title,
  description,
  connected,
  onOpen,
  actionLabel,
}: {
  icon: typeof Phone
  title: string
  description: string
  connected: boolean
  onOpen: () => void
  actionLabel: string
}) {
  return (
    <li className="flex items-center justify-between gap-5 border-t border-border/60 p-4 first:border-t-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunk-1 text-secondary-foreground">
          <Icon className="size-[17px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{title}</p>
          <p className={cn(MEASURE, 'text-muted-foreground')}>{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3.5">
        {connected && <span className="font-medium text-foreground">Connected</span>}
        <Button variant="outline" size="sm" onClick={onOpen}>
          {actionLabel}
        </Button>
      </div>
    </li>
  )
}

export function ConnectionsPanel({ settings }: { settings: AppSettings }) {
  const qc = useQueryClient()
  const { user } = useUser()
  const [open, setOpen] = useState<Open>(null)
  const [choice, setChoice] = useState<string | null>(null)
  const [granting, setGranting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const phone = settings.business.phoneNumber
  const calendarId = settings.business.calendarExternalId
  const calendarName = settings.business.calendarPayload?.summary

  /* Only reaches Google while the drawer is open. A connected agent reads the
     calendar's name from what is stored. */
  const { data, isLoading } = useQuery({
    queryKey: keys.calendarList,
    queryFn: fetchers.calendarList,
    enabled: open === 'calendar',
    staleTime: 0,
  })

  const selectCalendar = useMutation({
    mutationFn: (calendar: CalendarOption) =>
      apiClient.patch('/admin/calendar', {
        calendarId: calendar.id,
        summary: calendar.summary,
        timeZone: calendar.timeZone,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.settings })
      setChoice(null)
      toast.success('Calendar connected. Your agent can book appointments.')
    },
    onError: () => toast.error('Could not save that calendar. Try again.'),
  })

  const disconnect = useMutation({
    mutationFn: () => apiClient.delete('/admin/calendar'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.settings })
      await qc.invalidateQueries({ queryKey: keys.calendarList })
      setOpen(null)
      toast.success('Calendar disconnected')
    },
    onError: () => toast.error('Could not disconnect. Try again.'),
  })

  /** Both calls return an account whose `externalVerificationRedirectURL` is the
   *  consent screen; navigating there is this function's job. */
  async function grantAccess() {
    if (!user) return
    setGranting(true)
    try {
      const redirectUrl = `${window.location.origin}/sso-callback?returnTo=/settings?tab=connections`
      const scopes = ['https://www.googleapis.com/auth/calendar']
      const google = user.externalAccounts.find((a) => a.provider === 'google')
      const account = google
        ? await google.reauthorize({ additionalScopes: scopes, redirectUrl })
        : await user.createExternalAccount({
            strategy: 'oauth_google',
            redirectUrl,
            additionalScopes: scopes,
          })
      const next = account.verification?.externalVerificationRedirectURL
      if (!next) {
        toast.error('Google did not return a consent link. Try again.')
        setGranting(false)
        return
      }
      window.location.href = next.href
    } catch {
      toast.error('Could not open Google. Try again.')
      setGranting(false)
    }
  }

  const calendars = data?.calendars ?? []
  const selected = calendars.find((c) => c.id === choice)

  return (
    <div>
      <Section title="Connections" lede="What your agent is connected to.">
        <ConnectionRow
          icon={Phone}
          title="Phone number"
          description={phone ? 'The number your customers call.' : 'Not set up yet.'}
          connected={!!phone}
          onOpen={() => setOpen('phone')}
          actionLabel="Manage"
        />
        <ConnectionRow
          icon={Calendar}
          title="Google Calendar"
          description={
            calendarId
              ? 'Where your agent checks free time and writes appointments.'
              : 'Connect one so your agent can check times and book.'
          }
          connected={!!calendarId}
          onOpen={() => setOpen('calendar')}
          actionLabel={calendarId ? 'Manage' : 'Connect'}
        />
      </Section>

      <Sheet open={open === 'phone'} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Phone number</SheetTitle>
            <SheetDescription className="tabular-nums">
              {phone ? formatPhone(phone) : 'Not provisioned yet'}
            </SheetDescription>
          </SheetHeader>
          <div>
            <SubRow
              title="Your agent answers this number"
              description="Every call to this number reaches your agent."
            >
              <Switch checked disabled aria-label="Your agent answers this number" />
            </SubRow>
            <SubRow
              title="Transfer to a human"
              description="Passes a live call to a number you choose."
            >
              <Button variant="outline" size="sm" disabled>
                Not available yet
              </Button>
            </SubRow>
            <SubRow
              title="Text confirmations"
              description="A message after a booking, and a reminder the day before."
            >
              <Button variant="outline" size="sm" disabled>
                Not available yet
              </Button>
            </SubRow>
            <p className="mt-4 rounded-lg bg-sunk-1 p-3 text-muted-foreground">
              Transfer and texts both need the carrier upgrade, and texts also need
              carrier registration, which takes a few weeks.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={open === 'calendar'} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Google Calendar</SheetTitle>
            <SheetDescription>
              {calendarId ? `Writing to ${calendarName ?? calendarId}` : 'Not connected'}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3">
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : !data?.connected ? (
              <>
                <p className="text-muted-foreground">
                  Give your agent access to Google Calendar, then pick which calendar
                  holds your appointments.
                </p>
                <Button onClick={grantAccess} disabled={granting} className="self-start">
                  <Calendar />
                  {granting ? 'Opening Google' : 'Connect Google Calendar'}
                </Button>
              </>
            ) : calendars.length === 0 ? (
              <>
                <p className="text-muted-foreground">
                  This Google account has no calendar you can add events to. Create one in
                  Google Calendar, then check again.
                </p>
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => qc.invalidateQueries({ queryKey: keys.calendarList })}
                >
                  Check again
                </Button>
              </>
            ) : (
              <>
                <SubRow
                  title="Calendar"
                  description="Where your agent writes appointments."
                >
                  <Select
                    value={choice ?? calendarId ?? ''}
                    onValueChange={(v) => setChoice(v ?? null)}
                  >
                    <SelectTrigger className="w-field-md">
                      {/* Base UI renders the value rather than the label without
                          this. A calendar id is not a name. */}
                      <SelectValue placeholder="Pick a calendar">
                        {(value) =>
                          calendars.find((c) => c.id === value)?.summary ??
                          'Pick a calendar'
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {calendars.map((cal) => (
                        <SelectItem key={cal.id} value={cal.id}>
                          {cal.summary}
                          {cal.primary ? ' (main)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SubRow>
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDisconnect(true)}
                    disabled={!calendarId || disconnect.isPending}
                  >
                    Disconnect
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => selected && selectCalendar.mutate(selected)}
                    disabled={
                      !selected || selected.id === calendarId || selectCalendar.isPending
                    }
                  >
                    {selectCalendar.isPending ? 'Saving' : 'Use this calendar'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect this calendar?"
        description="Your agent stops checking times and booking. Existing appointments stay in the calendar."
        confirmLabel="Disconnect"
        variant="destructive"
        onConfirm={async () => {
          await disconnect.mutateAsync()
        }}
      />
    </div>
  )
}
