import { hc } from 'hono/client'
import type { AppRoutes } from '@api/routes'
import { getAuthToken } from './auth-token'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api'

/** Attaches the bearer token, and on a 401 retries once with a freshly minted one. */
const authedFetch: typeof fetch = async (input, init) => {
  const authorised = async (skipCache: boolean): Promise<RequestInit> => {
    const token = await getAuthToken(skipCache ? { skipCache: true } : undefined)
    const headers = new Headers(init?.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return { ...init, headers }
  }

  const res = await fetch(input, await authorised(false))
  if (res.status !== 401) return res

  const fresh = await getAuthToken({ skipCache: true })
  if (!fresh) return res
  return fetch(input, await authorised(true))
}

export const client = hc<AppRoutes>(BASE, { fetch: authedFetch })
