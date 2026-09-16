import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  WEEKDAYS,
  type BusinessHours,
  type BookingPolicy,
  type HoursException,
  type TimeInterval,
  type Weekday,
} from '@receptionist/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberField } from '@/components/ui/number-field'
import { DatePicker } from '@/components/ui/date-picker'
import { Switch } from '@/components/ui/switch'
import { apiClient } from '@/lib/apiClient'
import { keys } from '@/lib/queries'
import { formatDate } from '@/lib/formatters'
import type { AppSettings } from '@/lib/settings-types'
import { Section, Row, SubRow } from './SettingsList'
import { RecordDrawer } from './RecordDrawer'
import { useRecordDraft } from './useRecordDraft'
import { useServerSeed } from './useServerSeed'
import { SaveBar } from './SaveBar'

const DAY_LABELS: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** The server's rules again, so a problem shows next to the field. The API is
 *  reachable without this form, so it duplicates rather than replaces. */
function intervalProblem(intervals: TimeInterval[]): string | null {
  for (const i of intervals) {
    if (!i.start || !i.end) return 'Fill in both times'
    if (toMinutes(i.end) <= toMinutes(i.start)) return 'Closing must be after opening'
  }
  const sorted = [...intervals].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i]!.start) < toMinutes(sorted[i - 1]!.end)) {
      return 'Periods on the same day cannot overlap'
    }
  }
  return null
}

function Interval({
  interval,
  onChange,
  onRemove,
}: {
  interval: TimeInterval
  onChange: (patch: Partial<TimeInterval>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="time"
        value={interval.start}
        onChange={(e) => onChange({ start: e.target.value })}
        className="w-field-sm"
        aria-label="Opens at"
      />
      <span className="text-muted-foreground">to</span>
      <Input
        type="time"
        value={interval.end}
        onChange={(e) => onChange({ end: e.target.value })}
        className="w-field-sm"
        aria-label="Closes at"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Remove this period"
      >
        <X />
      </Button>
    </div>
  )
}

export function HoursPanel({ settings }: { settings: AppSettings }) {
  const qc = useQueryClient()
  const server = settings.business

  const [hours, setHours] = useState<BusinessHours>(server.businessHours)
  const [policy, setPolicy] = useState<BookingPolicy>(server.bookingPolicy)
  /* `index: null` is a date being added, which joins the list only on save. */
  const {
    draft,
    open: drawerOpen,
    edit: editDraft,
    patch: patchDraft,
    close: closeDrawer,
    reset: resetDraft,
    clear: clearDraft,
  } = useRecordDraft<{ index: number | null; value: HoursException }>()

  const dayProblems = WEEKDAYS.map((d) => intervalProblem(hours.weekly[d] ?? []))
  const exceptionProblems = hours.exceptions.map((e) => intervalProblem(e.intervals))
  const hasProblem = [...dayProblems, ...exceptionProblems].some(Boolean)

  const changes = useMemo(() => {
    const out: string[] = []
    if (JSON.stringify(hours.weekly) !== JSON.stringify(server.businessHours.weekly)) {
      out.push('opening hours')
    }
    if (
      JSON.stringify(hours.exceptions) !== JSON.stringify(server.businessHours.exceptions)
    ) {
      out.push('holidays')
    }
    if (JSON.stringify(policy) !== JSON.stringify(server.bookingPolicy)) {
      out.push('booking window')
    }
    return out
  }, [hours, policy, server])

  /* A save re-seeds so the saved shape is the one on screen. A background
     refetch must not, or it eats an unsaved edit. */
  const expectReseed = useServerSeed(server, changes.length > 0, () => {
    setHours(server.businessHours)
    setPolicy(server.bookingPolicy)
    resetDraft()
  })

  const save = useMutation({
    mutationFn: () =>
      apiClient.patch('/admin/settings', {
        business: { businessHours: hours, bookingPolicy: policy },
      }),
    onSuccess: async () => {
      expectReseed()
      await qc.invalidateQueries({ queryKey: keys.settings })
      toast.success('Hours saved')
    },
    onError: () => toast.error('Could not save. Check the times and try again.'),
  })

  function setDay(day: Weekday, intervals: TimeInterval[]) {
    setHours((h) => ({ ...h, weekly: { ...h.weekly, [day]: intervals } }))
  }

  function setExceptions(exceptions: HoursException[]) {
    setHours((h) => ({ ...h, exceptions }))
  }

  const patch = (next: Partial<HoursException>) =>
    patchDraft((d) => ({ ...d, value: { ...d.value, ...next } }))

  function commit() {
    if (!draft) return
    setExceptions(
      draft.index === null
        ? [...hours.exceptions, draft.value]
        : hours.exceptions.map((e, i) => (i === draft.index ? draft.value : e)),
    )
    closeDrawer()
  }

  function removeDraft() {
    if (draft && draft.index !== null) {
      setExceptions(hours.exceptions.filter((_, i) => i !== draft.index))
    }
    closeDrawer()
  }

  return (
    <div>
      <Section
        title="Opening hours"
        lede="Your agent only offers times inside these hours."
      >
        {WEEKDAYS.map((day, dayIndex) => {
          const intervals = hours.weekly[day] ?? []
          const open = intervals.length > 0
          const problem = dayProblems[dayIndex]
          return (
            <li
              key={day}
              className="flex items-start justify-between gap-5 border-t border-border/60 p-4 first:border-t-0"
            >
              <div className="flex min-w-0 items-center gap-3 pt-1">
                <Switch
                  checked={open}
                  onCheckedChange={(on) =>
                    setDay(day, on ? [{ start: '09:00', end: '17:00' }] : [])
                  }
                  aria-label={`Open on ${DAY_LABELS[day]}`}
                />
                <span className="font-medium text-foreground">{DAY_LABELS[day]}</span>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {!open ? (
                  <span className="pt-1.5 text-muted-foreground">Closed</span>
                ) : (
                  <>
                    {intervals.map((interval, i) => (
                      <Interval
                        key={i}
                        interval={interval}
                        onChange={(patch) =>
                          setDay(
                            day,
                            intervals.map((v, idx) =>
                              idx === i ? { ...v, ...patch } : v,
                            ),
                          )
                        }
                        onRemove={() =>
                          setDay(
                            day,
                            intervals.filter((_, idx) => idx !== i),
                          )
                        }
                      />
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDay(day, [...intervals, { start: '14:00', end: '18:00' }])
                      }
                    >
                      <Plus />
                      Add a second period
                    </Button>
                  </>
                )}
                {problem && <p className="text-destructive">{problem}</p>}
              </div>
            </li>
          )
        })}
      </Section>

      <Section
        title="Holidays"
        lede="Days that replace your weekly hours."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              editDraft({ index: null, value: { date: '', intervals: [], label: '' } })
            }
          >
            <Plus />
            Add a date
          </Button>
        }
        empty={hours.exceptions.length === 0}
      >
        {hours.exceptions.map((exception, i) => (
          <Row
            key={i}
            title={exception.date ? formatDate(`${exception.date}T12:00:00`) : 'New date'}
            description={
              exception.intervals.length === 0
                ? `${exception.label || 'Closed'}. Closed all day.`
                : `${exception.label || 'Open'}. ${exception.intervals[0]!.start} to ${exception.intervals[0]!.end}.`
            }
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => editDraft({ index: i, value: exception })}
            >
              Edit
            </Button>
          </Row>
        ))}
      </Section>

      {draft && (
        <RecordDrawer
          open={drawerOpen}
          onOpenChange={(v) => !v && closeDrawer()}
          onClosed={clearDraft}
          title={draft.index === null ? 'New date' : draft.value.label || 'Holiday'}
          description="This day replaces your weekly hours."
          saveLabel="Done"
          saveDisabled={!draft.value.date || !!intervalProblem(draft.value.intervals)}
          onSave={commit}
          onRemove={draft.index === null ? undefined : removeDraft}
          removeLabel="Remove date"
        >
          <SubRow title="Date" description="The day this applies to." htmlFor="hol-date">
            <DatePicker
              id="hol-date"
              value={draft.value.date}
              onChange={(date) => patch({ date })}
              className="w-field-md"
            />
          </SubRow>
          <SubRow
            title="Reason"
            description="For your own reference. Your agent never says it."
            htmlFor="hol-reason"
          >
            <Input
              id="hol-reason"
              className="w-field-md"
              value={draft.value.label ?? ''}
              onChange={(e) => patch({ label: e.target.value })}
            />
          </SubRow>
          <SubRow title="Open at all" description="Off means closed all day.">
            <Switch
              checked={draft.value.intervals.length > 0}
              onCheckedChange={(on) =>
                patch({ intervals: on ? [{ start: '09:00', end: '17:00' }] : [] })
              }
              aria-label="Open at all"
            />
          </SubRow>
          {draft.value.intervals.map((interval, j) => (
            <SubRow
              key={j}
              title="Open between"
              description="The hours for this one day."
            >
              <Interval
                interval={interval}
                onChange={(next) =>
                  patch({
                    intervals: draft.value.intervals.map((v, idx) =>
                      idx === j ? { ...v, ...next } : v,
                    ),
                  })
                }
                onRemove={() =>
                  patch({
                    intervals: draft.value.intervals.filter((_, idx) => idx !== j),
                  })
                }
              />
            </SubRow>
          ))}
          {intervalProblem(draft.value.intervals) && (
            <p className="pt-2 text-destructive">
              {intervalProblem(draft.value.intervals)}
            </p>
          )}
        </RecordDrawer>
      )}

      <Section
        title="Booking window"
        lede="How near and how far ahead a caller may book."
      >
        <Row
          title="Earliest a caller can book"
          description="Your agent will not offer a time sooner than this, so you get some warning."
          htmlFor="min-notice"
        >
          <NumberField
            id="min-notice"
            label="Minimum notice in minutes"
            unit="minutes"
            value={policy.minNoticeMinutes}
            onChange={(minNoticeMinutes) =>
              setPolicy((p) => ({ ...p, minNoticeMinutes }))
            }
          />
        </Row>
        <Row
          title="Furthest a caller can book"
          description="Your agent will not offer a date beyond this."
          htmlFor="max-advance"
        >
          <NumberField
            id="max-advance"
            label="Furthest ahead in days"
            unit="days"
            value={policy.maxAdvanceDays}
            onChange={(maxAdvanceDays) => setPolicy((p) => ({ ...p, maxAdvanceDays }))}
          />
        </Row>
      </Section>

      <SaveBar
        changes={hasProblem ? [] : changes}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onDiscard={() => {
          setHours(server.businessHours)
          setPolicy(server.bookingPolicy)
          resetDraft()
        }}
      />
    </div>
  )
}
