import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import {
  listKnowledge,
  deleteKnowledge,
} from "@receptionist/core/repositories/knowledge.js";

export const knowledge = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await listKnowledge(c.get("agentId"))))
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    await deleteKnowledge(id, c.get("agentId"));
    return c.json({ id, deleted: true });
  });
