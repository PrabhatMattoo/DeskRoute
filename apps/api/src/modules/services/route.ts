import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import {
  listServices,
  createService,
  updateService,
  deleteService,
  DuplicateServiceName,
} from "@receptionist/core/repositories/services.js";
import { serviceDraftSchema } from "@receptionist/shared";
import { serviceUpdateSchema } from "../../schemas.js";

export const services = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await listServices(c.get("agentId"))))
  .post("/", async (c) => {
    const parsed = serviceDraftSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      return c.json(await createService(c.get("agentId"), parsed.data), 201);
    } catch (err) {
      if (err instanceof DuplicateServiceName) return c.json({ error: err.message }, 409);
      throw err;
    }
  })
  .patch("/:id", async (c) => {
    const parsed = serviceUpdateSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try {
      const updated = await updateService(
        c.get("agentId"),
        c.req.param("id"),
        parsed.data,
      );
      if (!updated) return c.json({ error: "Service not found" }, 404);
      return c.json(updated);
    } catch (err) {
      if (err instanceof DuplicateServiceName) return c.json({ error: err.message }, 409);
      throw err;
    }
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await deleteService(c.get("agentId"), id);
    if (!deleted) return c.json({ error: "Service not found" }, 404);
    return c.json({ id, deleted: true });
  });
