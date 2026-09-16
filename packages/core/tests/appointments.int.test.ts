import { describe, it, expect } from "vitest";
import { getUpcomingByPhone } from "../src/repositories/appointments.js";
import { upsertCaller, setCallerName } from "../src/repositories/callers.js";
import { db } from "../src/db/client.js";
import { callers } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { makeAgent, makeAppointment } from "./factories.js";

/** The contracts that have to hold once a caller's identity can be null. */
describe("getUpcomingByPhone", () => {
  /**
   * A placeholder identity is a shared lookup key, so one anonymous caller's
   * booking is read back to the next. Kept as the consequence in one assertion.
   */
  it("returns any booking stored under a shared placeholder identity", async () => {
    const agent = await makeAgent();
    await makeAppointment(agent.id, { callerPhone: "unknown", serviceName: "Colour" });

    const whatTheNextAnonymousCallerWouldHear = await getUpcomingByPhone(
      agent.id,
      "unknown",
    );

    expect(whatTheNextAnonymousCallerWouldHear).toHaveLength(1);
    expect(whatTheNextAnonymousCallerWouldHear[0]!.service).toBe("Colour");
  });

  it("returns appointments for a caller who did share their number", async () => {
    const agent = await makeAgent();
    const phone = "+14155550123";
    await makeAppointment(agent.id, { callerPhone: phone, serviceName: "Haircut" });

    const found = await getUpcomingByPhone(agent.id, phone);

    expect(found).toHaveLength(1);
    expect(found[0]!.service).toBe("Haircut");
  });

  it("scopes lookups to the agent", async () => {
    const [a, b] = await Promise.all([makeAgent(), makeAgent()]);
    const phone = "+14155550123";
    await makeAppointment(a.id, { callerPhone: phone });

    expect(await getUpcomingByPhone(b.id, phone)).toEqual([]);
  });
});

describe("upsertCaller", () => {
  it("creates no client row when caller ID is withheld", async () => {
    const agent = await makeAgent();

    const result = await upsertCaller(agent.id, null);

    expect(result).toBeNull();
    const rows = await db.select().from(callers).where(eq(callers.agentId, agent.id));
    expect(rows).toEqual([]);
  });

  it("upserts on repeat calls from the same number rather than duplicating", async () => {
    const agent = await makeAgent();
    const phone = "+14155550123";

    const first = await upsertCaller(agent.id, phone);
    const second = await upsertCaller(agent.id, phone);

    expect(first).not.toBeNull();
    expect(second!.id).toBe(first!.id);

    const rows = await db.select().from(callers).where(eq(callers.agentId, agent.id));
    expect(rows).toHaveLength(1);
  });
});

describe("setCallerName", () => {
  it("records a name so the caller is recognised next time", async () => {
    const agent = await makeAgent();
    const client = await upsertCaller(agent.id, "+14155550123");

    const updated = await setCallerName(agent.id, client!.id, "  Sarah  ");

    expect(updated?.name).toBe("Sarah");
  });

  it("ignores a blank name rather than wiping an existing one", async () => {
    const agent = await makeAgent();
    const client = await upsertCaller(agent.id, "+14155550123");
    await setCallerName(agent.id, client!.id, "Sarah");

    expect(await setCallerName(agent.id, client!.id, "   ")).toBeNull();

    const [row] = await db.select().from(callers).where(eq(callers.id, client!.id));
    expect(row!.name).toBe("Sarah");
  });

  it("will not rename another agent's client", async () => {
    const [owner, attacker] = await Promise.all([makeAgent(), makeAgent()]);
    const client = await upsertCaller(owner.id, "+14155550123");

    expect(await setCallerName(attacker.id, client!.id, "Mallory")).toBeNull();
  });
});
