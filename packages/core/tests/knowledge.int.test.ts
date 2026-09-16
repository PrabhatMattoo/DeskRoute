import { describe, it, expect } from "vitest";
import { db } from "../src/db/client.js";
import { knowledgeItems } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { makeAgent, makeEscalation } from "./factories.js";

import {
  createKnowledgeFromEscalation,
  deleteKnowledge,
  listKnowledgeForPrompt,
  resolveEscalationWithKnowledge,
} from "../src/repositories/knowledge.js";
import { getEscalationById } from "../src/repositories/escalations.js";

describe("deleteKnowledge", () => {
  /** An escalation left resolved makes its question permanently unanswerable:
   *  the agent cannot answer it and the dedup index blocks a re-escalation. */
  it("reopens the source escalation so the question can be answered again", async () => {
    const agent = await makeAgent();
    const escalation = await makeEscalation(agent.id, {
      question: "Do you validate parking?",
    });

    await resolveEscalationWithKnowledge(escalation, agent.id, "Yes, up to two hours.");

    const [item] = await db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.sourceEscalationId, escalation.id));
    expect(item).toBeDefined();

    await deleteKnowledge(item!.id, agent.id);

    const after = await getEscalationById(escalation.id, agent.id);
    expect(after?.status).toBe("pending");
    expect(after?.answer).toBeNull();
    expect(after?.resolvedAt).toBeNull();
  });

  it("deletes knowledge that has no source escalation without error", async () => {
    const agent = await makeAgent();
    const escalation = await makeEscalation(agent.id);
    await createKnowledgeFromEscalation(escalation, "An answer.");

    const [item] = await db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.agentId, agent.id));

    // Detach it, mimicking an escalation deleted earlier (ON DELETE SET NULL).
    await db
      .update(knowledgeItems)
      .set({ sourceEscalationId: null })
      .where(eq(knowledgeItems.id, item!.id));

    await expect(deleteKnowledge(item!.id, agent.id)).resolves.not.toThrow();
  });

  it("will not delete another agent's knowledge", async () => {
    const [owner, attacker] = await Promise.all([makeAgent(), makeAgent()]);
    const escalation = await makeEscalation(owner.id);
    await createKnowledgeFromEscalation(escalation, "Owner's answer.");

    const [item] = await db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.agentId, owner.id));

    await deleteKnowledge(item!.id, attacker.id);

    const still = await db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, item!.id));
    expect(still).toHaveLength(1);
  });
});

describe("listKnowledgeForPrompt", () => {
  it("returns question and answer for the agent, oldest first", async () => {
    const agent = await makeAgent();
    const first = await makeEscalation(agent.id, { question: "First?" });
    await createKnowledgeFromEscalation(first, "First answer.");
    const second = await makeEscalation(agent.id, { question: "Second?" });
    await createKnowledgeFromEscalation(second, "Second answer.");

    const entries = await listKnowledgeForPrompt(agent.id);

    expect(entries.map((e) => e.question)).toEqual(["First?", "Second?"]);
    expect(entries[0]).toEqual({ question: "First?", answer: "First answer." });
  });

  it("is scoped to the agent", async () => {
    const [a, b] = await Promise.all([makeAgent(), makeAgent()]);
    const esc = await makeEscalation(a.id);
    await createKnowledgeFromEscalation(esc, "A's answer.");

    expect(await listKnowledgeForPrompt(b.id)).toEqual([]);
  });
});

describe("resolveEscalationWithKnowledge", () => {
  it("files the answer and resolves the escalation together", async () => {
    const agent = await makeAgent();
    const escalation = await makeEscalation(agent.id, { question: "Gift cards?" });

    await resolveEscalationWithKnowledge(escalation, agent.id, "Yes, any amount.");

    const after = await getEscalationById(escalation.id, agent.id);
    expect(after?.status).toBe("resolved");
    expect(after?.answer).toBe("Yes, any amount.");
    expect(after?.resolvedAt).not.toBeNull();

    expect(await listKnowledgeForPrompt(agent.id)).toEqual([
      { question: "Gift cards?", answer: "Yes, any amount." },
    ]);
  });

  it("writes no knowledge row when the escalation cannot be resolved", async () => {
    const agent = await makeAgent();
    const other = await makeAgent();
    // Belongs to `agent`, but resolved against `other` — the UPDATE matches no
    // row, so the transaction must roll the knowledge insert back with it.
    const escalation = await makeEscalation(agent.id, { question: "Orphan?" });

    await expect(
      resolveEscalationWithKnowledge(escalation, other.id, "Should not persist."),
    ).rejects.toThrow();

    expect(await listKnowledgeForPrompt(agent.id)).toEqual([]);
    const after = await getEscalationById(escalation.id, agent.id);
    expect(after?.status).toBe("pending");
  });
});
