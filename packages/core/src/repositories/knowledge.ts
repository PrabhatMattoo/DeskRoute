import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { knowledgeItems, escalations } from "../db/schema.js";
import type { EscalationRow } from "./escalations.js";

export type KnowledgeItemRow = typeof knowledgeItems.$inferSelect;

/** Seeding helper for the integration tests. Production goes through resolveEscalationWithKnowledge. */
export async function createKnowledgeFromEscalation(
  escalation: EscalationRow,
  answer: string,
): Promise<void> {
  await db.insert(knowledgeItems).values({
    agentId: escalation.agentId,
    sourceEscalationId: escalation.id,
    question: escalation.question,
    answer,
  });
}

/**
 * One transaction: a failed status update must not leave an orphan knowledge row
 * behind an escalation still showing as pending.
 */
export async function resolveEscalationWithKnowledge(
  escalation: EscalationRow,
  agentId: string,
  answer: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(knowledgeItems).values({
      agentId: escalation.agentId,
      sourceEscalationId: escalation.id,
      question: escalation.question,
      answer,
    });

    const updated = await tx
      .update(escalations)
      .set({ status: "resolved", answer, resolvedAt: new Date() })
      .where(and(eq(escalations.id, escalation.id), eq(escalations.agentId, agentId)))
      .returning({ id: escalations.id });

    if (!updated[0]) throw new Error(`Escalation ${escalation.id} not found`);
  });
}

/**
 * Capped because this is inlined into the system prompt at call start. Above
 * roughly 300 items the lookup belongs in an on-turn hook, not the prompt.
 */
export const KNOWLEDGE_PROMPT_LIMIT = 300;

/** Oldest first, so the prompt prefix stays stable and cacheable as items are added. */
export async function listKnowledgeForPrompt(
  agentId: string,
): Promise<Array<{ question: string; answer: string }>> {
  return db
    .select({ question: knowledgeItems.question, answer: knowledgeItems.answer })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.agentId, agentId))
    .orderBy(knowledgeItems.createdAt)
    .limit(KNOWLEDGE_PROMPT_LIMIT);
}

export async function listKnowledge(agentId: string) {
  return db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      answer: knowledgeItems.answer,
      createdAt: knowledgeItems.createdAt,
    })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.agentId, agentId))
    .orderBy(desc(knowledgeItems.createdAt))
    .limit(100);
}

/** Reopens the source escalation in the same transaction, or its question
 *  becomes permanently unanswerable. */
export async function deleteKnowledge(id: string, agentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(knowledgeItems)
      .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.agentId, agentId)))
      .returning({ sourceEscalationId: knowledgeItems.sourceEscalationId });

    const sourceEscalationId = deleted[0]?.sourceEscalationId;
    if (!sourceEscalationId) return;

    await tx
      .update(escalations)
      .set({ status: "pending", answer: null, resolvedAt: null })
      .where(
        and(eq(escalations.id, sourceEscalationId), eq(escalations.agentId, agentId)),
      );
  });
}
