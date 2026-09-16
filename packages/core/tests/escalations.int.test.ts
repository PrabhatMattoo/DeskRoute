import { describe, it, expect, beforeAll } from "vitest";
import { createEscalation, getEscalationById } from "../src/repositories/escalations.js";
import { db } from "../src/db/client.js";
import { escalations } from "../src/db/schema.js";
import { eq, sql } from "drizzle-orm";

const RACE_WIDTH = 8;

/**
 * A cold pool staggers the SELECTs behind connection latency and hides the race.
 * A warm pool, which is the normal case, exposes it.
 */
beforeAll(async () => {
  await Promise.all(
    Array.from({ length: RACE_WIDTH }, () => db.execute(sql`SELECT pg_sleep(0.15)`)),
  );
});
import { makeAgent, makeCall } from "./factories.js";

/** Concurrent by necessity: a sequential version of this passes either way. */
describe("createEscalation", () => {
  it("returns the existing row instead of throwing when two land at once", async () => {
    const agent = await makeAgent();
    const call = await makeCall(agent.id);

    const input = {
      agentId: agent.id,
      callId: call.id,
      callerPhone: "+14155550123",
      question: "Do you offer gift cards?",
    };

    // All start before any finishes — the real in-turn race, against the
    // pre-warmed pool established in beforeAll.
    const results = await Promise.all(
      Array.from({ length: RACE_WIDTH }, () => createEscalation({ ...input })),
    );

    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);

    const rows = await db
      .select()
      .from(escalations)
      .where(eq(escalations.callId, call.id));
    expect(rows).toHaveLength(1);
  });

  it("dedupes case-insensitively, matching the index definition", async () => {
    const agent = await makeAgent();
    const call = await makeCall(agent.id);
    const base = { agentId: agent.id, callId: call.id, callerPhone: "+14155550123" };

    const a = await createEscalation({ ...base, question: "Do you take card?" });
    const b = await createEscalation({ ...base, question: "DO YOU TAKE CARD?" });

    expect(b.id).toBe(a.id);
  });

  it("keeps the same question separate across different calls", async () => {
    const agent = await makeAgent();
    const [callOne, callTwo] = await Promise.all([
      makeCall(agent.id),
      makeCall(agent.id),
    ]);
    const q = "Do you validate parking?";

    const a = await createEscalation({
      agentId: agent.id,
      callId: callOne.id,
      callerPhone: "+14155550001",
      question: q,
    });
    const b = await createEscalation({
      agentId: agent.id,
      callId: callTwo.id,
      callerPhone: "+14155550002",
      question: q,
    });

    expect(b.id).not.toBe(a.id);
  });

  it("records an escalation from a caller with no number", async () => {
    const agent = await makeAgent();
    const call = await makeCall(agent.id, { callerPhone: null });

    const row = await createEscalation({
      agentId: agent.id,
      callId: call.id,
      callerPhone: null,
      question: "Are you open on Sunday?",
    });

    const stored = await getEscalationById(row.id, agent.id);
    expect(stored).not.toBeNull();
  });
});

describe("escalation before the call row exists (PLAN.md 1.7.3)", () => {
  /**
   * The agent is live before the `calls` row exists, and preemptive generation
   * starts work before the turn is confirmed, so the window is reachable.
   */
  it("rejects an escalation naming a call row that does not exist", async () => {
    const agent = await makeAgent();
    const ghostCallId = "00000000-0000-4000-8000-000000000000";

    // This is the mid-call throw the guard prevents.
    await expect(
      createEscalation({
        agentId: agent.id,
        callId: ghostCallId,
        callerPhone: "+14155550123",
        question: "Are you open Sunday?",
      }),
    ).rejects.toThrow();
  });

  it("records the escalation unlinked when the call row is unavailable", async () => {
    const agent = await makeAgent();

    // What the tool does when callRowReady resolves false: keep the question,
    // drop the link, rather than losing the escalation entirely.
    const row = await createEscalation({
      agentId: agent.id,
      callId: null,
      callerPhone: "+14155550123",
      question: "Are you open Sunday?",
    });

    expect(row.callId).toBeNull();
    expect(row.question).toBe("Are you open Sunday?");
    expect(row.status).toBe("pending");
  });
});
