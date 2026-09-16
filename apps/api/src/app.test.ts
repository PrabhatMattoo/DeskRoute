import { describe, it, expect } from "vitest";
import { createApp } from "./app.js";

/**
 * CORS is an allowlist. A wildcard origin lets any page on the internet drive
 * `/api/admin/*` with a token it has obtained.
 */
describe("CORS", () => {
  const DASHBOARD = "http://localhost:5173";
  const app = createApp({ allowedOrigins: [DASHBOARD] });

  it("allows the dashboard origin", async () => {
    const res = await app.request("/api/health", {
      headers: { Origin: DASHBOARD },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(DASHBOARD);
  });

  it("does not send a wildcard to an unknown origin", async () => {
    const res = await app.request("/api/health", {
      headers: { Origin: "https://evil.example" },
    });
    const allowed = res.headers.get("access-control-allow-origin");
    expect(allowed).not.toBe("*");
    expect(allowed).not.toBe("https://evil.example");
  });

  it("allows whatever port Vite actually grabbed", async () => {
    // Vite takes the next free port when 5173 is busy, so any localhost port is
    // accepted once a localhost origin is listed.
    for (const port of [5174, 5175, 4173]) {
      const res = await app.request("/api/health", {
        headers: { Origin: `http://localhost:${port}` },
      });
      expect(res.headers.get("access-control-allow-origin")).toBe(
        `http://localhost:${port}`,
      );
    }
  });

  it("allows 127.0.0.1 as well as localhost", async () => {
    const res = await app.request("/api/health", {
      headers: { Origin: "http://127.0.0.1:5174" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5174");
  });

  it("does not extend the localhost exception to a production allowlist", async () => {
    // A deployed config lists real hostnames, so localhost must NOT slip in.
    const prod = createApp({ allowedOrigins: ["https://app.deskroute.com"] });

    const local = await prod.request("/api/health", {
      headers: { Origin: "http://localhost:5174" },
    });
    expect(local.headers.get("access-control-allow-origin")).toBeNull();

    const real = await prod.request("/api/health", {
      headers: { Origin: "https://app.deskroute.com" },
    });
    expect(real.headers.get("access-control-allow-origin")).toBe(
      "https://app.deskroute.com",
    );
  });

  it("does not send a wildcard on preflight for admin routes", async () => {
    const res = await app.request("/api/admin/settings", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "PATCH",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
  });
});
