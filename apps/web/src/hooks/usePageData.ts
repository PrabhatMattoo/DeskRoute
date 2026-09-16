import { useEffect, useState } from 'react'

/**
 * One loading boundary per page, so queries landing separately do not paint in
 * pieces. The skeleton waits 200ms, so a warm load never flashes one.
 */
export function usePageReady(
  pending: boolean,
  delay = 200,
): {
  ready: boolean
  showSkeleton: boolean
} {
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    if (!pending) return
    setWaited(false)
    const timer = setTimeout(() => setWaited(true), delay)
    return () => clearTimeout(timer)
  }, [pending, delay])

  return { ready: !pending, showSkeleton: pending && waited }
}
