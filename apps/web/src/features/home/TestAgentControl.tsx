import { useState, useCallback, lazy, Suspense } from 'react'
import { toast } from 'sonner'
import { Mic, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { client } from '@/lib/client'
import type { TestSessionData } from './LiveControl'

/* The LiveKit stack is half a megabyte and only needed once a test starts. */
const LiveControl = lazy(() => import('./LiveControl'))

/**
 * Morphs in place rather than opening a modal. Idle it is a button; live it
 * becomes a pill holding the visualiser, and pressing it ends the session.
 */
export function TestAgentControl() {
  const [sessionData, setSessionData] = useState<TestSessionData | null>(null)
  const [loading, setLoading] = useState(false)

  const start = useCallback(async () => {
    setLoading(true)
    try {
      const res = await client.admin.agent.test.$post()
      if (!res.ok) throw new Error(`agent test ${res.status}`)
      setSessionData(await res.json())
    } catch (err: unknown) {
      console.error('[TestAgent] could not start a session:', err)
      toast.error('Could not start the test. Try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const stop = useCallback(() => setSessionData(null), [])

  if (sessionData) {
    return (
      <Suspense
        fallback={
          <Button size="lg" className="w-30" disabled>
            <Loader2 className="animate-spin" />
            Connecting
          </Button>
        }
      >
        <LiveControl sessionData={sessionData} onEnd={stop} />
      </Suspense>
    )
  }

  return (
    <Button size="lg" className="w-30" onClick={start} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <Mic />}
      {loading ? 'Connecting' : 'Test Agent'}
    </Button>
  )
}
