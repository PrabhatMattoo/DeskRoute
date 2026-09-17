import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import type { EscalationItem } from '@receptionist/shared'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/layout/PageContainer'
import { EmptyState } from '@/layout/EmptyState'
import { apiClient } from '@/lib/apiClient'
import { keys, fetchers } from '@/lib/queries'
import { useAgentZone } from '@/hooks/useAgentZone'
import { formatCaller, formatDateTime } from '@/lib/formatters'

/**
 * One question at a time, with a way through the ones still waiting. A resolved
 * question reached by id reads back its answer instead of offering the form.
 */
export default function QueuePage() {
  const qc = useQueryClient()
  const zone = useAgentZone()
  const [params, setParams] = useSearchParams()
  const [answer, setAnswer] = useState('')

  const pending = useQuery({
    queryKey: keys.escalations('pending'),
    queryFn: () => fetchers.escalations('pending'),
  })
  const resolved = useQuery({
    queryKey: keys.escalations('resolved'),
    queryFn: () => fetchers.escalations('resolved'),
  })

  const queue = pending.data ?? []
  const requestedId = params.get('id')

  const fromQueue = requestedId ? queue.findIndex((e) => e.id === requestedId) : 0
  const index = fromQueue >= 0 ? fromQueue : 0
  const current: EscalationItem | undefined =
    (requestedId && resolved.data?.find((e) => e.id === requestedId)) || queue[index]

  const isAnswered = current?.status === 'resolved'

  useEffect(() => setAnswer(''), [current?.id])

  function goTo(next: number) {
    const target = queue[next]
    if (!target) return
    const p = new URLSearchParams(params)
    p.set('id', target.id)
    setParams(p, { replace: true })
  }

  const resolve = useMutation({
    mutationFn: (text: string) =>
      apiClient.post(`/admin/escalations/${current?.id}/resolve`, { answer: text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.escalationsAll })
      qc.invalidateQueries({ queryKey: keys.metricsAll })
      qc.invalidateQueries({ queryKey: keys.knowledge })
      setAnswer('')
      const next = queue[index + 1]
      const p = new URLSearchParams(params)
      if (next) p.set('id', next.id)
      else p.delete('id')
      setParams(p, { replace: true })
      toast.success('Answered. The next caller who asks gets it.')
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Could not save that answer. Try again.'
      toast.error(message)
    },
  })

  if (pending.isLoading || resolved.isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-8 w-96" />
        <Skeleton className="mt-6 h-28 w-full" />
      </PageContainer>
    )
  }

  if (!current) {
    return (
      <PageContainer className="flex flex-1 flex-col">
        <EmptyState
          icon={Inbox}
          title="Nothing waiting on you"
          description="Every caller question has an answer. New ones land here."
          action={
            <Button
              variant="outline"
              render={<Link to="/escalations" />}
              nativeButton={false}
            >
              See every question
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {isAnswered ? 'Answered' : 'Answer the queue'}
          </h1>
          {!isAnswered && queue.length > 0 && (
            <span className="text-muted-foreground tabular-nums">
              {index + 1} of {queue.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous question"
            disabled={isAnswered || index === 0}
            onClick={() => goTo(index - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next question"
            disabled={isAnswered || index >= queue.length - 1}
            onClick={() => goTo(index + 1)}
          >
            <ChevronRight />
          </Button>
          <Link to="/escalations" className="ml-1 text-primary hover:underline">
            All questions
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-narrow px-6 py-9">
        <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground tabular-nums">
          <span>{formatDateTime(current.createdAt, zone)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatCaller(current.callerName, current.callerPhone)}</span>
          {current.callId && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                to={`/calls/${current.callId}`}
                className="text-primary hover:underline"
              >
                hear the call
              </Link>
            </>
          )}
        </p>

        <h2 className="mt-2.5 text-xl leading-tight font-semibold tracking-tight text-foreground">
          {current.question}
        </h2>

        {isAnswered ? (
          <div className="mt-7">
            <h3 className="font-medium text-foreground">Your answer</h3>
            <p className="mt-2 leading-relaxed whitespace-pre-wrap text-secondary-foreground">
              {current.answer}
            </p>
          </div>
        ) : (
          <div className="mt-7">
            <label htmlFor="answer" className="block font-medium text-foreground">
              Your answer
            </label>
            <p className="mt-0.5 mb-2 text-muted-foreground">
              Your agent says this to the next caller who asks.
            </p>
            <Textarea
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write the answer the way you would say it aloud."
              className="min-h-28 resize-none"
            />
            <div className="mt-3.5 flex items-center gap-3">
              <Button
                onClick={() => resolve.mutate(answer)}
                disabled={!answer.trim() || resolve.isPending}
              >
                {resolve.isPending ? 'Saving' : 'Save and next'}
              </Button>
              <Button
                variant="outline"
                onClick={() => goTo(index + 1)}
                disabled={index >= queue.length - 1}
              >
                Skip
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
