import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

/** A failed body parse answers 400 with the flattened issues the dashboard already reads. */
export const body = <T extends ZodType>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) return c.json({ error: result.error.flatten() }, 400);
  });

export const query = <T extends ZodType>(schema: T) => zValidator("query", schema);
