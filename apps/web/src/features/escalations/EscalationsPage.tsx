import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import type { EscalationItem, EscalationStatus } from '@receptionist/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { FilterPills } from '@/components/ui/filter-pills'
import { DataList, type Column } from '@/components/ui/data-list'
import { PageContainer } from '@/layout/PageContainer'
import { PageHeader } from '@/layout/PageHeader'
import { keys, fetchers } from '@/lib/queries'
import { useAgentZone } from '@/hooks/useAgentZone'
import { formatCaller, formatTime } from '@/lib/formatters'
import { groupByDay } from '@/lib/group-by-day'

type Filter = 'all' | EscalationStatus

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Waiting' },
  { id: 'resolved', label: 'Answered' },
] as const satisfies readonly { id: Filter; label: string }[]

function columns(zone: string | undefined): Column<EscalationItem>[] {
  return [
    {
      key: 'time',
      header: 'Time',
      width: '76px',
      cell: (e) => (
        <span className="text-muted-foreground tabular-nums">
          {formatTime(e.createdAt, zone)}
        </span>
      ),
    },
    {
      key: 'question',
      header: 'Question',
      width: 'minmax(0,1fr)',
      cell: (e) => e.question,
    },
    {
      key: 'caller',
      header: 'Caller',
      width: '188px',
      hideUnder: 'sm',
      cell: (e) => (
        <span className="truncate text-muted-foreground tabular-nums">
          {formatCaller(e.callerName, e.callerPhone)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '86px',
      align: 'end',
      cell: (e) =>
        e.status === 'pending' ? (
          <span className="font-medium text-accent-ink">Waiting</span>
        ) : (
          <span className="text-muted-foreground">Answered</span>
        ),
    },
  ]
}

/** Every question a caller has asked that the agent could not answer. */
export default function EscalationsPage() {
  const zone = useAgentZone()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const pending = useQuery({
    queryKey: keys.escalations('pending'),
    queryFn: () => fetchers.escalations('pending'),
  })
  const resolved = useQuery({
    queryKey: keys.escalations('resolved'),
    queryFn: () => fetchers.escalations('resolved'),
  })

  const isLoading = pending.isLoading || resolved.isLoading
  const waiting = pending.data?.length ?? 0
  const total = (pending.data?.length ?? 0) + (resolved.data?.length ?? 0)

  const rows = useMemo(() => {
    const all = [...(pending.data ?? []), ...(resolved.data ?? [])].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    const byStatus = filter === 'all' ? all : all.filter((e) => e.status === filter)
    const term = search.trim().toLowerCase()
    return term
      ? byStatus.filter((e) => e.question.toLowerCase().includes(term))
      : byStatus
  }, [pending.data, resolved.data, filter, search])

  const groups = useMemo(() => groupByDay(rows, zone, (r) => r.createdAt), [rows, zone])

  return (
    <PageContainer className="flex flex-1 flex-col">
      <PageHeader
        title="Escalations"
        description="Questions your agent could not answer. Answer one and it never has to ask you again."
        actions={
          waiting > 0 ? (
            <Button render={<Link to="/escalations/queue" />} nativeButton={false}>
              Answer the queue ({waiting})
            </Button>
          ) : undefined
        }
      />

      {(isLoading || total > 0) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-field-lg shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions"
              aria-label="Search questions"
              className="w-full pl-8"
            />
          </div>
          <FilterPills
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            label="Question status"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : total === 0 ? (
        <p className="py-2 text-muted-foreground">
          Nothing waiting on you. A question your agent cannot answer lands here.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-2 text-muted-foreground">Nothing matches that.</p>
      ) : (
        <DataList
          columns={columns(zone)}
          groups={groups}
          rowKey={(e) => e.id}
          href={(e) => `/escalations/queue?id=${e.id}`}
          rowLabel={(e) => e.question}
        />
      )}
    </PageContainer>
  )
}
