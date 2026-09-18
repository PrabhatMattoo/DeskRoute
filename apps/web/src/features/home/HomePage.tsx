import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { PageContainer } from '@/layout/PageContainer'
import { PageHeader } from '@/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { client } from '@/lib/client'
import { keys, fetchers, ensureOk } from '@/lib/queries'
import { usePageReady } from '@/hooks/usePageData'
import { formatPhone } from '@/lib/formatters'
import type { Period } from '@/lib/types'
import { CallStats } from './CallStats'
import { CallsTable } from './CallsTable'
import { TestAgentControl } from './TestAgentControl'
import { SetupChecklist, SetupBanner } from './SetupChecklist'
import { setupItems } from './setup-items'

function isPeriod(v: string | null): v is Period {
  return v === 'today' || v === '7d' || v === '30d'
}

function HomeSkeleton() {
  return (
    <>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-6 w-80" />
      <Skeleton className="mt-7 h-7 w-96" />
      <div className="mt-8 flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </>
  )
}

/**
 * What happened while you were out, and what still needs you. Settings and
 * metrics are fetched here, so the page paints once rather than in three stages.
 */
export default function HomePage() {
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const raw = params.get('period')
  const period: Period = isPeriod(raw) ? raw : '30d'

  const [settings, metrics] = useQueries({
    queries: [
      { queryKey: keys.settings, queryFn: fetchers.settings },
      { queryKey: keys.metrics(period), queryFn: () => fetchers.metrics(period) },
    ],
  })

  const dismiss = useMutation({
    mutationFn: () =>
      client.admin.settings
        .$patch({ json: { setup: { checklistDismissed: true } } })
        .then(ensureOk),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.settings }),
  })

  const { ready, showSkeleton } = usePageReady(settings.isPending || metrics.isPending)

  if (!ready) {
    return <PageContainer>{showSkeleton ? <HomeSkeleton /> : null}</PageContainer>
  }

  const s = settings.data!
  const m = metrics.data!
  const items = setupItems(s)
  const outstanding = items.some((i) => !i.done)
  // An agent with no calls at all, ever — not a filtered view that happens to be
  // empty, which the period pills can produce on any day.
  const neverCalled = m.totalCalls === 0 && period === '30d'

  return (
    <PageContainer>
      <PageHeader
        title={s.business.name}
        actions={<TestAgentControl />}
        description={
          <>
            {s.business.industry}
            {s.business.phoneNumber && (
              <>
                {' · '}
                {s.agent.name || 'Your agent'} is answering{' '}
                <span className="text-secondary-foreground tabular-nums">
                  {formatPhone(s.business.phoneNumber)}
                </span>
              </>
            )}
          </>
        }
      />

      {neverCalled ? (
        outstanding && <SetupChecklist items={items} />
      ) : (
        <>
          <CallStats period={period} metrics={m} agentName={s.agent.name} />
          {outstanding && !s.setup.checklistDismissed && (
            <SetupBanner items={items} onDismiss={() => dismiss.mutate()} />
          )}
        </>
      )}

      <CallsTable />
    </PageContainer>
  )
}
