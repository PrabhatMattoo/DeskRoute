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
import { body } from "../../validate.js";

export const services = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await listServices(c.get("agentId"))))
  .post("/", body(serviceDraftSchema), async (c) => {
    try {
      return c.json(await createService(c.get("agentId"), c.req.valid("json")), 201);
    } catch (err) {
      if (err instanceof DuplicateServiceName) return c.json({ error: err.message }, 409);
      throw err;
    }
  })
  .patch("/:id", body(serviceUpdateSchema), async (c) => {
    try {
      const updated = await updateService(
        c.get("agentId"),
        c.req.param("id"),
        c.req.valid("json"),
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
