import { db } from "../src/db/client.js";
import {
  agents,
  callers,
  calls,
  escalations,
  appointments,
  services,
  phoneNumbers,
} from "../src/db/schema.js";
import type { AgentProfile, Service } from "@receptionist/shared";

/**
 * Fixture builders for integration tests. Every one takes overrides so a test
 * states only the fields it actually cares about — the rest is plausible noise.
 */

let seq = 0;
const uniq = () => `${Date.now()}-${++seq}`;

export const AGENT_PROFILE: AgentProfile = {
  name: "Riley",
  greeting: "Thanks for calling Test Business, this is Riley.",
  farewell: "Thanks for calling, goodbye.",
  fallback: "Let me check with the team and get back to you.",
};

/** Deliberately different shapes: slot generation behaves differently for each. */
export const SERVICES: Service[] = [
  {
    id: "33333333-3333-3333-3333-333333333331",
    name: "Haircut",
    price: "$45",
    description: "Wash, cut and style",
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    requiredResources: [],
  },
  {
    id: "33333333-3333-3333-3333-333333333332",
    name: "Colour",
    price: "$120",
    durationMinutes: 120,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 15,
    requiredResources: [],
  },
];

export async function makeAgent(overrides: Partial<typeof agents.$inferInsert> = {}) {
  const rows = await db
    .insert(agents)
    .values({
      businessName: "Test Business",
      industry: "Pet services",
      timezone: "America/New_York",
      description: "A test business.",
      personaName: AGENT_PROFILE.name,
      greeting: AGENT_PROFILE.greeting,
      farewell: AGENT_PROFILE.farewell,
      fallback: AGENT_PROFILE.fallback,
      clerkUserId: `user_${uniq()}`,
      ...overrides,
    })
    .returning();
  return rows[0]!;
}

export async function makeCaller(
  agentId: string,
  overrides: Partial<typeof callers.$inferInsert> = {},
) {
  const rows = await db
    .insert(callers)
    .values({
      agentId,
      phoneNumber: `+1555${uniq().slice(-7)}`,
      lastSeenAt: new Date(),
      ...overrides,
    })
    .returning();
  return rows[0]!;
}

export async function makeCall(
  agentId: string,
  overrides: Partial<typeof calls.$inferInsert> = {},
) {
  const rows = await db
    .insert(calls)
    .values({
      agentId,
      callerPhone: `+1555${uniq().slice(-7)}`,
      roomName: `call-${uniq()}`,
      ...overrides,
    })
    .returning();
  return rows[0]!;
}

export async function makeEscalation(
  agentId: string,
  overrides: Partial<typeof escalations.$inferInsert> = {},
) {
  const rows = await db
    .insert(escalations)
    .values({
      agentId,
      callerPhone: `+1555${uniq().slice(-7)}`,
      question: "Do you have parking?",
      status: "pending",
      ...overrides,
    })
    .returning();
  return rows[0]!;
}

export async function makeAppointment(
  agentId: string,
  overrides: Partial<typeof appointments.$inferInsert> = {},
) {
  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const rows = await db
    .insert(appointments)
    .values({
      agentId,
      callerPhone: `+1555${uniq().slice(-7)}`,
      serviceName: "Haircut",
      startTime,
      endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
      status: "confirmed",
      ...overrides,
    })
    .returning();
  return rows[0]!;
}

export async function makeService(
  agentId: string,
  overrides: Partial<typeof services.$inferInsert> = {},
) {
  const rows = await db
    .insert(services)
    .values({
      agentId,
      name: `Haircut ${uniq()}`,
      price: "$45",
      durationMinutes: 30,
      ...overrides,
    })
    .returning();
  return rows[0]!;
}

export async function makePhoneNumber(
  agentId: string,
  overrides: Partial<typeof phoneNumbers.$inferInsert> = {},
) {
  const rows = await db
    .insert(phoneNumbers)
    .values({ agentId, e164: `+1555${uniq().slice(-7)}`, ...overrides })
    .returning();
  return rows[0]!;
}
