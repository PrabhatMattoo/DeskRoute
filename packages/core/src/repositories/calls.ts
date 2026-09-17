import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { calls, callers } from "../db/schema.js";
import type { TranscriptEntry, CallOutcome } from "../db/schema.js";

export type CallRow = typeof calls.$inferSelect;

type CreateCallInput = {
  id?: string; // caller-generated UUID — omit to let Postgres generate one
  agentId: string;
  callerId?: string | null;
  callerPhone: string | null;
  roomName: string;
  /** Which disclosure wording the caller heard. The compliance audit trail. */
  disclosureVersion?: string;
};

export async function createCall(input: CreateCallInput): Promise<CallRow> {
  const rows = await db
    .insert(calls)
    .values({
      ...(input.id ? { id: input.id } : {}),
      agentId: input.agentId,
      callerId: input.callerId ?? null,
      callerPhone: input.callerPhone,
      roomName: input.roomName,
      disclosureVersion: input.disclosureVersion ?? null,
    })
    .returning();

  return rows[0];
}

type FinishCallData = {
  outcome: CallOutcome;
  transcript: TranscriptEntry[];
  summary: string | null;
  recordingKey: string | null;
};

export async function finishCall(callId: string, data: FinishCallData): Promise<void> {
  await db
    .update(calls)
    .set({
      endedAt: new Date(),
      outcome: data.outcome,
      transcript: data.transcript,
      summary: data.summary,
      recordingKey: data.recordingKey,
    })
    .where(eq(calls.id, callId));
}

export async function listCalls(agentId: string, limit = 50, offset = 0) {
  return db
    .select({
      id: calls.id,
      callerId: calls.callerId,
      callerPhone: calls.callerPhone,
      // A caller with a name on file is shown by it, sparing the owner a number
      // they would have to recognise.
      callerName: callers.name,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
      outcome: calls.outcome,
      summary: calls.summary,
    })
    .from(calls)
    .leftJoin(callers, eq(calls.callerId, callers.id))
    .where(eq(calls.agentId, agentId))
    .orderBy(desc(calls.startedAt))
    .limit(limit)
    .offset(offset);
}

export async function getCallById(callId: string, agentId: string) {
  const rows = await db
    .select({
      id: calls.id,
      callerId: calls.callerId,
      callerPhone: calls.callerPhone,
      callerName: callers.name,
      roomName: calls.roomName,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
      outcome: calls.outcome,
      transcript: calls.transcript,
      summary: calls.summary,
      recordingKey: calls.recordingKey,
    })
    .from(calls)
    .leftJoin(callers, eq(calls.callerId, callers.id))
    .where(and(eq(calls.id, callId), eq(calls.agentId, agentId)))
    .limit(1);

  return rows[0] ?? null;
}
