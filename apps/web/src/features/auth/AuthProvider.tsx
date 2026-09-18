import { useAuth } from '@clerk/react'
import { useLayoutEffect } from 'react'
import { setTokenGetter } from '@/lib/auth-token'

/**
 * Wires Clerk's `getToken` into the API client. `useLayoutEffect` runs before
 * children paint, so the first request already carries a token.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth()

  useLayoutEffect(() => {
    if (isLoaded) {
      setTokenGetter(getToken)
    }
    return () => setTokenGetter(null)
  }, [getToken, isLoaded])

  if (!isLoaded) return null

  return <>{children}</>
}
