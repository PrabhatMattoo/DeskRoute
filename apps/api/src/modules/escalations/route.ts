import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import {
  listEscalations,
  getEscalationById,
} from "@receptionist/core/repositories/escalations.js";
import { resolveEscalationWithKnowledge } from "@receptionist/core/repositories/knowledge.js";
import { escalationResolveSchema, escalationsQuerySchema } from "../../schemas.js";
import { body, query } from "../../validate.js";

export const escalations = new Hono<AppEnv>()
  .get("/", query(escalationsQuerySchema), async (c) => {
    const { status } = c.req.valid("query");
    return c.json(await listEscalations(c.get("agentId"), status));
  })
  .post("/:id/resolve", body(escalationResolveSchema), async (c) => {
    const agentId = c.get("agentId");
    const id = c.req.param("id");

    const escalation = await getEscalationById(id, agentId);
    if (!escalation) return c.json({ error: "Escalation not found" }, 404);

    await resolveEscalationWithKnowledge(escalation, agentId, c.req.valid("json").answer);
    return c.json({ id, status: "resolved" });
  });
