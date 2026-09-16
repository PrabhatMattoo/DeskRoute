import { and, count, eq, gte } from "drizzle-orm";
import type { BusinessHours } from "@receptionist/shared";
import { db } from "../db/client.js";
import { calls, escalations, appointments, agents } from "../db/schema.js";
import { isAfterHours } from "../domain/business-hours.js";

/**
 * Counted in memory because opening hours are jsonb read in the agent's own
 * zone, and `isAfterHours` already carries that logic under test.
 */
export async function countAfterHoursCalls(
  agentId: string,
  since: Date,
  hours: BusinessHours,
  timeZone: string,
): Promise<number> {
  const rows = await db
    .select({ startedAt: calls.startedAt })
    .from(calls)
    .where(and(eq(calls.agentId, agentId), gte(calls.startedAt, since)));

  return rows.reduce(
    (n, r) => n + (isAfterHours(r.startedAt, hours, timeZone) ? 1 : 0),
    0,
  );
}

export async function countCalls(agentId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(calls)
    .where(and(eq(calls.agentId, agentId), gte(calls.startedAt, since)));
  return Number(rows[0]!.count);
}

export async function countAbandonedCalls(agentId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(calls)
    .where(
      and(
        eq(calls.agentId, agentId),
        eq(calls.outcome, "abandoned"),
        gte(calls.startedAt, since),
      ),
    );
  return Number(rows[0]!.count);
}

export async function countConfirmedBookings(
  agentId: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.agentId, agentId),
        eq(appointments.status, "confirmed"),
        gte(appointments.createdAt, since),
      ),
    );
  return Number(rows[0]!.count);
}

/** Every pending escalation, ignoring the period: an unanswered question does not age out. */
export async function countPendingEscalations(agentId: string): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(escalations)
    .where(and(eq(escalations.agentId, agentId), eq(escalations.status, "pending")));
  return Number(rows[0]!.count);
}

export async function getHoursAndZone(agentId: string) {
  const rows = await db
    .select({ businessHours: agents.businessHours, timezone: agents.timezone })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  return rows[0] ?? null;
}
