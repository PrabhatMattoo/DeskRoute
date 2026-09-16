import { Hono } from "hono";
import { getAuth } from "@clerk/hono";
import type { AppEnv } from "../../types.js";
import { getAgentById, updateAgent } from "@receptionist/core/repositories/agents.js";
import {
  listCalendars,
  CalendarScopeMissingError,
} from "@receptionist/core/providers/calendar.js";
import {
  getGoogleOAuthToken,
  forgetGoogleOAuthToken,
} from "@receptionist/core/providers/googleAuth.js";
import { calendarSelectSchema } from "../../schemas.js";

export const calendar = new Hono<AppEnv>()
  .get("/list", async (c) => {
    const token = await getGoogleOAuthToken(getAuth(c)!.userId!);
    // No token and a sign-in token without calendar scope are the same answer.
    if (!token) return c.json({ connected: false, calendars: [] });

    try {
      return c.json({ connected: true, calendars: await listCalendars(token) });
    } catch (err) {
      if (err instanceof CalendarScopeMissingError) {
        return c.json({ connected: false, calendars: [] });
      }
      throw err;
    }
  })
  .patch("/", async (c) => {
    const parsed = calendarSelectSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { calendarId, summary, timeZone } = parsed.data;

    // The display name is stored beside the id so Settings renders a name
    // without a round trip to Google on every load.
    await updateAgent(c.get("agentId"), {
      calendarProvider: "google",
      calendarExternalId: calendarId,
      calendarPayload: { summary, ...(timeZone ? { timeZone } : {}) },
    });

    return c.json({ connected: true, calendarExternalId: calendarId });
  })
  // Existing appointments stay: they are commitments in a calendar the owner
  // still holds. The agent stops offering new ones.
  .delete("/", async (c) => {
    const agentId = c.get("agentId");
    const agent = await getAgentById(agentId);
    if (!agent) return c.json({ error: "Agent not found" }, 404);

    await updateAgent(agentId, {
      calendarProvider: null,
      calendarExternalId: null,
      calendarPayload: null,
    });

    forgetGoogleOAuthToken(getAuth(c)!.userId!);
    return c.json({ connected: false });
  });
