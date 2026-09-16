import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { callers, escalations } from "../db/schema.js";

export type EscalationRow = typeof escalations.$inferSelect;

type CreateEscalationInput = {
  agentId: string;
  callId?: string | null;
  callerId?: string | null;
  callerPhone: string | null;
  callerName?: string | null;
  question: string;
  transcriptExcerpt?: string | null;
};

/**
 * At most once per (call, question). Insert-first, because SELECT-then-INSERT is
 * a race two tool calls in one turn both lose, throwing out of the tool mid-call.
 */
export async function createEscalation(
  input: CreateEscalationInput,
): Promise<EscalationRow> {
  const rows = await db
    .insert(escalations)
    .values({
      agentId: input.agentId,
      callId: input.callId ?? null,
      callerId: input.callerId ?? null,
      callerPhone: input.callerPhone,
      callerName: input.callerName ?? null,
      question: input.question,
      transcriptExcerpt: input.transcriptExcerpt ?? null,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();

  if (rows[0]) return rows[0];

  // Fetches the row that won. Reachable only with a callId, since the unique
  // index is partial on call_id IS NOT NULL.
  const existing = await db
    .select()
    .from(escalations)
    .where(
      and(
        eq(escalations.callId, input.callId!),
        sql`lower(${escalations.question}) = lower(${input.question})`,
      ),
    )
    .limit(1);

  if (!existing[0]) {
    throw new Error(
      `[escalations] insert conflicted but no existing row found for call ${input.callId}`,
    );
  }
  return existing[0];
}

export async function listEscalations(agentId: string, status: "pending" | "resolved") {
  return db
    .select({
      id: escalations.id,
      callId: escalations.callId,
      callerPhone: escalations.callerPhone,
      // The name given at escalation wins; the stored client name is the
      // fallback for a caller we already knew.
      callerName: sql<
        string | null
      >`coalesce(${escalations.callerName}, ${callers.name})`,
      question: escalations.question,
      status: escalations.status,
      answer: escalations.answer,
      createdAt: escalations.createdAt,
    })
    .from(escalations)
    .leftJoin(callers, eq(escalations.callerId, callers.id))
    .where(and(eq(escalations.agentId, agentId), eq(escalations.status, status)))
    .orderBy(desc(escalations.createdAt))
    .limit(100);
}

export async function getEscalationById(
  id: string,
  agentId: string,
): Promise<EscalationRow | null> {
  // Full row: a narrower select cast to `EscalationRow` would claim fields it
  // leaves undefined at runtime.
  const rows = await db
    .select()
    .from(escalations)
    .where(and(eq(escalations.id, id), eq(escalations.agentId, agentId)))
    .limit(1);

  return rows[0] ?? null;
}
