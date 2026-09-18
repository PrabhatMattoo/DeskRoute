import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import { listCalls, getCallById } from "@receptionist/core/repositories/calls.js";
import { getPresignedRecordingUrl } from "@receptionist/core/providers/storage.js";
import { callsQuerySchema } from "../../schemas.js";
import { query } from "../../validate.js";

export const calls = new Hono<AppEnv>()
  .get("/", query(callsQuerySchema), async (c) => {
    const { limit, offset } = c.req.valid("query");
    return c.json(await listCalls(c.get("agentId"), limit, offset));
  })
  .get("/:id", async (c) => {
    const call = await getCallById(c.req.param("id"), c.get("agentId"));
    if (!call) return c.json({ error: "Call not found" }, 404);
    return c.json(call);
  })
  .get("/:id/recording", async (c) => {
    const callId = c.req.param("id");
    const call = await getCallById(callId, c.get("agentId"));
    if (!call) return c.json({ error: "Call not found" }, 404);
    if (!call.recordingKey) return c.json({ error: "No recording for this call" }, 404);
    return c.json({ url: await getPresignedRecordingUrl(callId) });
  });
