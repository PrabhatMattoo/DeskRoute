import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { DashboardMetrics } from '@receptionist/shared'
import { FilterPills } from '@/components/ui/filter-pills'
import type { Period } from '@/lib/types'

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
] as const satisfies readonly { id: Period; label: string }[]

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
}

/** Numbers are ink; the sentence around them is not. */
function N({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/**
 * A handover in sentences, which a wall of tiles cannot do. Two lines because
 * the period pills scope the first and not the second.
 */
export function CallStats({
  period,
  metrics,
  agentName,
}: {
  period: Period
  metrics: DashboardMetrics
  agentName: string
}) {
  const [params, setParams] = useSearchParams()

  function setPeriod(next: Period) {
    const p = new URLSearchParams(params)
    p.set('period', next)
    setParams(p, { replace: true })
  }

  const { totalCalls, afterHoursCalls, confirmedBookings, pendingEscalations } = metrics
  const who = agentName.trim() || 'Your agent'

  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1 text-md text-muted-foreground">
        <p className="tabular-nums">
          {PERIOD_LABEL[period]} — {who}{' '}
          {totalCalls === 0 ? (
            <>answered no calls yet.</>
          ) : (
            <>
              answered <N>{totalCalls}</N> {plural(totalCalls, 'call', 'calls')}
              {afterHoursCalls > 0 && (
                <>
                  , <N>{afterHoursCalls}</N> of them after you closed
                </>
              )}
              {confirmedBookings > 0 && (
                <>
                  , and booked <N>{confirmedBookings}</N>
                </>
              )}
              .
            </>
          )}
        </p>

        {pendingEscalations > 0 && (
          <Link
            to="/escalations/queue"
            className="group flex w-fit items-center gap-1.5 tabular-nums text-accent-ink hover:underline"
          >
            <span>
              <span className="font-medium">{pendingEscalations}</span>{' '}
              {plural(pendingEscalations, 'question is', 'questions are')} waiting for
              your answer.
            </span>
            <ArrowRight className="size-4 shrink-0" />
          </Link>
        )}
      </div>

      <FilterPills
        options={PERIODS}
        value={period}
        onChange={setPeriod}
        label="Time period"
        className="shrink-0"
      />
    </div>
  )
}
