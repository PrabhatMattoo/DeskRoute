import { Hono } from "hono";
import { cors } from "hono/cors";
import { routes } from "./routes.js";

export type AppOptions = {
  /**
   * Origins permitted to call the API. Anything else gets no
   * `access-control-allow-origin` header at all, so the browser blocks it.
   */
  allowedOrigins: string[];
};

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Exact match, except that any localhost port passes once a localhost origin is
 * listed: Vite takes the next free port when its default is busy.
 */
export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (!allowedOrigins.some((o) => LOCALHOST.test(o))) return false;
  return LOCALHOST.test(origin);
}

/**
 * Builds the API app without binding a port, so tests can drive it through
 * `app.request()` (PLAN.md 1.8.5).
 */
export function createApp({ allowedOrigins }: AppOptions) {
  const app = new Hono();

  // Scoped to the dashboard. `cors()` with no options answers every origin with
  // `*` on every route, /api/admin/* included.
  app.use(
    "*",
    cors({
      origin: (origin) => (isAllowedOrigin(origin, allowedOrigins) ? origin : null),
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
      maxAge: 86_400,
    }),
  );

  app.route("/api", routes);

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[server] unhandled error:", err);
    return c.json({ error: message }, 500);
  });

  return app;
}
