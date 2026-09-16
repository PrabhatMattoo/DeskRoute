import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { agents, phoneNumbers } from "../db/schema.js";

export type AgentRow = typeof agents.$inferSelect;

const agentFields = {
  id: agents.id,
  businessName: agents.businessName,
  personaName: agents.personaName,
  industry: agents.industry,
  timezone: agents.timezone,
  description: agents.description,
  greeting: agents.greeting,
  farewell: agents.farewell,
  fallback: agents.fallback,
  businessHours: agents.businessHours,
  minNoticeMinutes: agents.minNoticeMinutes,
  maxAdvanceDays: agents.maxAdvanceDays,
  recordCalls: agents.recordCalls,
  checklistDismissed: agents.checklistDismissed,
  hoursSeen: agents.hoursSeen,
  clerkUserId: agents.clerkUserId,
  calendarProvider: agents.calendarProvider,
  calendarExternalId: agents.calendarExternalId,
  calendarPayload: agents.calendarPayload,
} as const;

/** The agent as the worker and the dashboard both read it. */
export type AgentConfig = { [K in keyof typeof agentFields]: AgentRow[K] };

export async function resolveAgentByClerkUserId(
  clerkUserId: string,
): Promise<AgentConfig | null> {
  const rows = await db
    .select(agentFields)
    .from(agents)
    .where(eq(agents.clerkUserId, clerkUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAgentById(id: string): Promise<AgentConfig | null> {
  const rows = await db
    .select(agentFields)
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** The call path: the dialled number decides whose configuration answers. */
export async function getAgentByPhoneNumber(e164: string): Promise<AgentConfig | null> {
  const rows = await db
    .select(agentFields)
    .from(agents)
    .innerJoin(phoneNumbers, eq(phoneNumbers.agentId, agents.id))
    .where(eq(phoneNumbers.e164, e164))
    .limit(1);
  return rows[0] ?? null;
}

export async function listPhoneNumbers(agentId: string) {
  return db
    .select()
    .from(phoneNumbers)
    .where(eq(phoneNumbers.agentId, agentId))
    .orderBy(phoneNumbers.createdAt);
}

export async function addPhoneNumber(input: {
  agentId: string;
  e164: string;
  provider?: typeof phoneNumbers.$inferInsert.provider;
  providerSid?: string;
  label?: string;
}): Promise<void> {
  await db.insert(phoneNumbers).values(input);
}

export async function removePhoneNumber(agentId: string, e164: string): Promise<void> {
  await db
    .delete(phoneNumbers)
    .where(and(eq(phoneNumbers.agentId, agentId), eq(phoneNumbers.e164, e164)));
}

export async function createAgent(input: {
  businessName: string;
  industry: string;
  timezone: string;
  clerkUserId: string;
  description?: string;
  personaName?: string;
  greeting?: string;
  farewell?: string;
  fallback?: string;
  businessHours?: import("@receptionist/shared").BusinessHours;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
}): Promise<AgentConfig> {
  const rows = await db.insert(agents).values(input).returning(agentFields);
  return rows[0]!;
}

export async function updateAgent(
  id: string,
  patch: Partial<
    Pick<
      AgentRow,
      | "businessName"
      | "personaName"
      | "industry"
      | "description"
      | "greeting"
      | "farewell"
      | "fallback"
      | "businessHours"
      | "minNoticeMinutes"
      | "maxAdvanceDays"
      | "recordCalls"
      | "checklistDismissed"
      | "hoursSeen"
      | "timezone"
      | "calendarProvider"
      | "calendarExternalId"
      | "calendarPayload"
    >
  >,
): Promise<void> {
  await db
    .update(agents)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(agents.id, id));
}
