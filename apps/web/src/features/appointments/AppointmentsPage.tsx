import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AppointmentItem } from '@/lib/api-types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { PageContainer } from '@/layout/PageContainer'
import { PageHeader } from '@/layout/PageHeader'
import { keys, fetchers } from '@/lib/queries'
import { useAgentZone } from '@/hooks/useAgentZone'
import { formatPhone, formatTime, dayKey, relativeDay } from '@/lib/formatters'
import { appointmentStatusConfig } from '@/lib/status-config'
import { cn } from '@/lib/utils'

const GRID = 'grid grid-cols-[62px_1fr_168px_58px_86px] items-center gap-3'
const DAY_MS = 86_400_000

/** The Monday of the week a date falls in. */
function weekStart(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(12, 0, 0, 0)
  const offset = (copy.getDay() + 6) % 7
  return new Date(copy.getTime() - offset * DAY_MS)
}

function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

export default function AppointmentsPage() {
  const zone = useAgentZone()
  const { data, isLoading } = useQuery({
    queryKey: keys.appointments,
    queryFn: fetchers.appointments,
  })
  const appointments = useMemo(() => data ?? [], [data])

  const [monday, setMonday] = useState(() => weekStart(new Date()))
  const [selected, setSelected] = useState(() =>
    dayKey(new Date().toISOString(), undefined),
  )

  const week = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY_MS)),
    [monday],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentItem[]>()
    for (const a of appointments) {
      if (!a.startTime) continue
      const key = dayKey(a.startTime, zone)
      const list = map.get(key)
      if (list) list.push(a)
      else map.set(key, [a])
    }
    for (const list of map.values()) {
      list.sort((x, y) => (x.startTime ?? '').localeCompare(y.startTime ?? ''))
    }
    return map
  }, [appointments, zone])

  const undated = useMemo(() => appointments.filter((a) => !a.startTime), [appointments])
  const shown = byDay.get(selected) ?? []
  const selectedDate =
    week.find((d) => dayKey(d.toISOString(), zone) === selected) ?? week[0]!

  const totalMinutes = shown.reduce(
    (sum, a) => sum + (minutesBetween(a.startTime, a.endTime) ?? 0),
    0,
  )

  return (
    <PageContainer>
      <PageHeader
        title="Appointments"
        description="Everything your agent books into your calendar."
      />

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous week"
          onClick={() => setMonday(new Date(monday.getTime() - 7 * DAY_MS))}
        >
          <ChevronLeft />
        </Button>
        <div className="flex flex-1 justify-between">
          {week.map((d) => {
            const key = dayKey(d.toISOString(), zone)
            const count = byDay.get(key)?.length ?? 0
            const on = key === selected
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-pressed={on}
                className={cn(
                  'flex w-[13%] flex-col items-center gap-1.5 rounded-lg py-2 transition-colors',
                  on ? 'bg-active' : 'hover:bg-hover',
                )}
              >
                <span className="text-muted-foreground">
                  {d.toLocaleDateString('en-US', { weekday: 'short', timeZone: zone })}
                </span>
                <span
                  className={cn(
                    'text-base tabular-nums',
                    on ? 'font-semibold text-foreground' : 'text-foreground',
                    count === 0 && !on && 'text-muted-foreground',
                  )}
                >
                  {d.toLocaleDateString('en-US', { day: 'numeric', timeZone: zone })}
                </span>
                <span className="flex h-1.5 items-center gap-[3px]">
                  {Array.from({ length: Math.min(count, 5) }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'size-1 rounded-full',
                        on ? 'bg-accent-ink' : 'bg-muted-foreground',
                      )}
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next week"
          onClick={() => setMonday(new Date(monday.getTime() + 7 * DAY_MS))}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="mt-7 flex items-baseline justify-between px-2.5 pb-1.5">
        <h2 className="font-medium text-muted-foreground">
          {relativeDay(selectedDate.toISOString(), zone)}
        </h2>
        <span className="text-muted-foreground tabular-nums">
          {shown.length === 0
            ? 'nothing booked'
            : `${shown.length} booked${totalMinutes > 0 ? `, ${Math.round((totalMinutes / 60) * 10) / 10} hr` : ''}`}
        </span>
      </div>
      <div className="border-t border-border">
        {isLoading ? (
          <div className="flex flex-col gap-2 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="px-2.5 py-3.5 text-muted-foreground">
            Nothing booked. Your agent offers times on this day whenever you are open.
          </p>
        ) : (
          shown.map((a) => {
            const mins = minutesBetween(a.startTime, a.endTime)
            return (
              <div key={a.id} className={`${GRID} h-9 rounded-lg px-2.5 hover:bg-hover`}>
                <span className="text-muted-foreground tabular-nums">
                  {a.startTime ? formatTime(a.startTime, zone) : ''}
                </span>
                <span className="truncate text-foreground">{a.service}</span>
                <span className="truncate text-muted-foreground">
                  {a.callerName ??
                    (a.callerPhone ? formatPhone(a.callerPhone) : 'Name not given')}
                </span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {mins ? `${mins} min` : ''}
                </span>
                <span className="text-right">
                  <StatusBadge value={a.status} config={appointmentStatusConfig} />
                </span>
              </div>
            )
          })
        )}
      </div>

      {undated.length > 0 && (
        <p className="mt-5 px-2.5 text-muted-foreground">
          {undated.length}{' '}
          {undated.length === 1 ? 'appointment has' : 'appointments have'} no time yet, so
          they do not appear on a day.
        </p>
      )}
    </PageContainer>
  )
}
