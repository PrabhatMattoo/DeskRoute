import { useEffect, useMemo, useRef } from 'react'
import type { CallListItem } from '@receptionist/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { DataList, type Column } from '@/components/ui/data-list'
import { useCallsQuery } from '@/hooks/useCallsQuery'
import { useAgentZone } from '@/hooks/useAgentZone'
import { formatCaller, formatTime, formatDuration } from '@/lib/formatters'
import { groupByDay } from '@/lib/group-by-day'
import { callOutcomeConfig } from '@/lib/status-config'

/** The group carries the date, so the column carries only the time. */
function columns(zone: string | undefined): Column<CallListItem>[] {
  return [
    {
      key: 'time',
      header: 'Time',
      width: '76px',
      cell: (c) => (
        <span className="text-muted-foreground tabular-nums">
          {formatTime(c.startedAt, zone)}
        </span>
      ),
    },
    {
      key: 'summary',
      header: 'Summary',
      width: 'minmax(0,1fr)',
      cell: (c) =>
        c.summary || (
          <span className="text-muted-foreground">Hung up during the greeting</span>
        ),
    },
    {
      key: 'caller',
      header: 'Caller',
      width: '188px',
      hideUnder: 'sm',
      cell: (c) => (
        <span className="truncate text-muted-foreground tabular-nums">
          {formatCaller(c.callerName, c.callerPhone)}
        </span>
      ),
    },
    {
      key: 'length',
      header: 'Length',
      width: '64px',
      align: 'end',
      hideUnder: 'md',
      cell: (c) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDuration(c.startedAt, c.endedAt) ?? ''}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      width: '86px',
      align: 'end',
      cell: (c) => <StatusBadge value={c.outcome} config={callOutcomeConfig} />,
    },
  ]
}

export function CallsTable() {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const zone = useAgentZone()
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useCallsQuery()

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasNextPage) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '200px' },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const calls = useMemo(() => data?.pages.flat() ?? [], [data])
  const groups = useMemo(() => groupByDay(calls, zone, (c) => c.startedAt), [calls, zone])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  if (calls.length === 0) {
    return (
      <p className="py-2 text-muted-foreground">
        No calls yet. Ring your number and the first one lands here.
      </p>
    )
  }

  return (
    <div>
      <DataList
        columns={columns(zone)}
        groups={groups}
        rowKey={(c) => c.id}
        href={(c) => `/calls/${c.id}`}
        rowLabel={(c) => c.summary || 'Call detail'}
      />
      {hasNextPage && (
        <div ref={sentinelRef} className="flex items-center justify-center py-3">
          {isFetchingNextPage && <Skeleton className="h-4 w-24" />}
        </div>
      )}
    </div>
  )
}
