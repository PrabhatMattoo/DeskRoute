import { db } from "../db/client.js";
import { and, eq } from "drizzle-orm";
import { callers } from "../db/schema.js";

export type CallerRow = typeof callers.$inferSelect;

/** Null for a withheld number: an anonymous caller has no identity to key a row on. */
export async function upsertCaller(
  agentId: string,
  callerPhone: string | null,
): Promise<CallerRow | null> {
  if (!callerPhone) return null;

  const now = new Date();

  const rows = await db
    .insert(callers)
    .values({
      agentId,
      phoneNumber: callerPhone,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [callers.agentId, callers.phoneNumber],
      set: { lastSeenAt: now, updatedAt: now },
    })
    .returning();

  return rows[0]!;
}

/** Scoped by agent, so one agent cannot rename another's caller. */
export async function setCallerName(
  agentId: string,
  callerId: string,
  name: string,
): Promise<CallerRow | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const rows = await db
    .update(callers)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(callers.id, callerId), eq(callers.agentId, agentId)))
    .returning();

  return rows[0] ?? null;
}
