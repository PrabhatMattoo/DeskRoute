import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import {
  getAgentById,
  addPhoneNumber,
  listPhoneNumbers,
  removePhoneNumber,
} from "@receptionist/core/repositories/agents.js";
import {
  searchPhoneNumbers,
  purchasePhoneNumber,
  releasePhoneNumber,
  InvalidAreaCode,
} from "@receptionist/core/providers/telephony.js";
import { phoneProvisionSchema } from "../../schemas.js";

export const telephony = new Hono<AppEnv>()
  .get("/search", async (c) => {
    try {
      return c.json(await searchPhoneNumbers(c.req.query("areaCode")));
    } catch (err) {
      if (err instanceof InvalidAreaCode) return c.json({ message: err.message }, 400);
      throw err;
    }
  })
  .post("/provision", async (c) => {
    const agentId = c.get("agentId");
    const agent = await getAgentById(agentId);
    if (!agent) return c.json({ error: "Agent not found" }, 404);

    const parsed = phoneProvisionSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

    const purchased = await purchasePhoneNumber(parsed.data.phoneNumber);
    try {
      await addPhoneNumber({ agentId, e164: purchased.e164_format, provider: "livekit" });
    } catch (dbErr) {
      await releasePhoneNumber(purchased.e164_format).catch((e: unknown) =>
        console.error("[telephony] rollback release failed:", e),
      );
      throw dbErr;
    }

    return c.json({ phoneNumber: purchased.e164_format });
  })
  .delete("/", async (c) => {
    const agentId = c.get("agentId");
    const agent = await getAgentById(agentId);
    if (!agent) return c.json({ error: "Agent not found" }, 404);

    for (const number of await listPhoneNumbers(agentId)) {
      await releasePhoneNumber(number.e164).catch((e: unknown) =>
        console.error("[telephony] release failed:", e),
      );
      await removePhoneNumber(agentId, number.e164);
    }

    return c.json({ ok: true });
  });
