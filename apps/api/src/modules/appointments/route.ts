import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import { listAppointments } from "@receptionist/core/repositories/appointments.js";

export const appointments = new Hono<AppEnv>().get("/", async (c) =>
  c.json(await listAppointments(c.get("agentId"))),
);
