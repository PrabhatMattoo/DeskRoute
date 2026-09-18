import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import type { CallDetail } from '@/lib/api-types'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { PageContainer } from '@/layout/PageContainer'
import { PageHeader } from '@/layout/PageHeader'
import { keys, fetchers } from '@/lib/queries'
import { useAgentZone } from '@/hooks/useAgentZone'
import { callOutcomeConfig } from '@/lib/status-config'
import { formatPhone, formatDateTime, formatDuration } from '@/lib/formatters'
import AudioPlayer from './AudioPlayer'

/** A labelled fact in the header strip. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-foreground tabular-nums">
        {children}
      </dd>
    </div>
  )
}

/** A call is a record with a URL, so it gets a page rather than a drawer. */
export default function CallDetailPage() {
  const { id = '' } = useParams()
  const zone = useAgentZone()

  const { data: call, isLoading } = useQuery<CallDetail>({
    queryKey: keys.call(id),
    queryFn: () => fetchers.call(id),
    enabled: !!id,
  })

  if (isLoading || !call) {
    return (
      <PageContainer>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-6 h-7 w-64" />
        <Skeleton className="mt-4 h-16 w-full rounded-xl" />
        <Skeleton className="mt-6 h-14 w-full rounded-xl" />
        <Skeleton className="mt-8 h-52 w-full" />
      </PageContainer>
    )
  }

  const length = formatDuration(call.startedAt, call.endedAt)

  return (
    <PageContainer>
      <Link
        to="/"
        className="mb-5 inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All calls
      </Link>

      <PageHeader
        className="mb-5"
        title={call.summary || 'This call was too short to summarise'}
        actions={<StatusBadge value={call.outcome} config={callOutcomeConfig} />}
      />

      <dl className="mb-7 grid grid-cols-3 gap-x-6 gap-y-4 rounded-xl bg-card p-4 shadow-control">
        <Fact label="Caller ID">
          {call.callerPhone ? formatPhone(call.callerPhone) : 'No caller ID'}
        </Fact>
        <Fact label="When">{formatDateTime(call.startedAt, zone)}</Fact>
        <Fact label="Length">{length ?? 'Still running'}</Fact>
      </dl>

      <AudioPlayer callId={id} hasRecording={!!call.recordingKey} />

      <h2 className="mt-8 mb-2 font-medium text-foreground">Transcript</h2>
      <div className="border-t border-border">
        {call.transcript?.length ? (
          call.transcript.map((entry, i) => (
            <div key={i} className="grid grid-cols-[64px_1fr] gap-4 py-2.5">
              <span className="text-muted-foreground">
                {entry.role === 'user' ? 'Caller' : 'Agent'}
              </span>
              <span
                className={
                  entry.role === 'user'
                    ? 'leading-relaxed text-foreground'
                    : 'leading-relaxed text-secondary-foreground'
                }
              >
                {entry.text}
              </span>
            </div>
          ))
        ) : (
          <p className="py-3 text-muted-foreground">
            No transcript was captured for this call.
          </p>
        )}
      </div>
    </PageContainer>
  )
}
