import type { ClientResponse } from 'hono/client'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { client } from './client'
import type { EscalationStatus } from '@receptionist/shared'
import type { Period } from './types'

export const keys = {
  /* Prefixes, so an invalidation meaning "every period" is written in these keys
     rather than a bare array that stops matching when the shape changes. */
  metricsAll: ['metrics'] as const,
  escalationsAll: ['escalations'] as const,
  metrics: (period: Period) => ['metrics', period] as const,
  escalations: (status: EscalationStatus) => ['escalations', status] as const,
  knowledge: ['knowledge'] as const,
  calls: () => ['calls'] as const,
  call: (id: string) => ['calls', id] as const,
  callRecording: (id: string) => ['calls', id, 'recording'] as const,
  session: ['session'] as const,
  settings: ['settings'] as const,
  appointments: ['appointments'] as const,
  calendarList: ['calendar', 'list'] as const,
}

/** A non-2xx throws, which is what React Query turns into an error state. `info`
 *  carries the server's own message where it sent one. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public info?: string,
  ) {
    super(info ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
  }
}

/** Rejects a mutation on a non-2xx, which `fetch` resolves rather than throws. */
export async function ensureOk(
  res: ClientResponse<unknown, ContentfulStatusCode, 'json'>,
): Promise<void> {
  if (!res.ok) return fail(res)
}

export async function fail(
  res: ClientResponse<unknown, ContentfulStatusCode, 'json'>,
): Promise<never> {
  let info: string | undefined
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object') {
      const b = body as { message?: unknown; error?: unknown }
      if (typeof b.message === 'string') info = b.message
      else if (typeof b.error === 'string') info = b.error
    }
  } catch {
    /* no JSON body to read */
  }
  throw new ApiError(res.status, info)
}

export const fetchers = {
  metrics: async (period: Period) => {
    const res = await client.admin.metrics.$get({ query: { period } })
    return res.ok ? res.json() : fail(res)
  },

  escalations: async (status: EscalationStatus) => {
    const res = await client.admin.escalations.$get({ query: { status } })
    return res.ok ? res.json() : fail(res)
  },

  knowledge: async () => {
    const res = await client.admin.knowledge.$get()
    return res.ok ? res.json() : fail(res)
  },

  calls: async ({ limit = 25, offset = 0 }: { limit?: number; offset?: number } = {}) => {
    const res = await client.admin.calls.$get({
      query: { limit: String(limit), offset: String(offset) },
    })
    return res.ok ? res.json() : fail(res)
  },

  call: async (id: string) => {
    const res = await client.admin.calls[':id'].$get({ param: { id } })
    return res.ok ? res.json() : fail(res)
  },

  callRecording: async (id: string) => {
    const res = await client.admin.calls[':id'].recording.$get({ param: { id } })
    return res.ok ? res.json() : fail(res)
  },

  session: async () => {
    const res = await client.onboarding.session.$get()
    return res.ok ? res.json() : fail(res)
  },

  settings: async () => {
    const res = await client.admin.settings.$get()
    return res.ok ? res.json() : fail(res)
  },

  appointments: async () => {
    const res = await client.admin.appointments.$get()
    return res.ok ? res.json() : fail(res)
  },

  calendarList: async () => {
    const res = await client.admin.calendar.list.$get()
    return res.ok ? res.json() : fail(res)
  },
}
