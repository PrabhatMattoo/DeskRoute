import type { InferResponseType } from 'hono/client'
import { client } from './client'

/** The response shapes, inferred from the handlers so a route change surfaces here. */

export type CallListItem = InferResponseType<typeof client.admin.calls.$get, 200>[number]
export type CallDetail = InferResponseType<
  (typeof client.admin.calls)[':id']['$get'],
  200
>
export type EscalationItem = InferResponseType<
  typeof client.admin.escalations.$get,
  200
>[number]
export type KnowledgeItem = InferResponseType<
  typeof client.admin.knowledge.$get,
  200
>[number]
export type AppointmentItem = InferResponseType<
  typeof client.admin.appointments.$get,
  200
>[number]
export type DashboardMetrics = InferResponseType<typeof client.admin.metrics.$get, 200>
export type AppSettings = InferResponseType<typeof client.admin.settings.$get, 200>
