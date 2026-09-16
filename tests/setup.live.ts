import { initializeLogger } from "@livekit/agents";
import "dotenv/config";

/**
 * Real credentials and real accounts. The check below is the guard: a surviving
 * placeholder means the suite is pointed at a fake and asserts nothing.
 */
initializeLogger({ pretty: false, level: "warn" });

/** Placeholder values from `vitest.config.ts`. Their presence means a leak. */
const PLACEHOLDERS: Record<string, string> = {
  CLERK_SECRET_KEY: "sk_test_dummy",
  LIVEKIT_API_KEY: "test-key",
  DATABASE_URL: "postgresql://deskroute:deskroute@localhost:5433/deskroute_test",
};

const leaked = Object.entries(PLACEHOLDERS)
  .filter(([key, placeholder]) => process.env[key] === placeholder)
  .map(([key]) => key);

if (leaked.length > 0) {
  throw new Error(
    `[live] refusing to run: ${leaked.join(", ")} still holds the placeholder ` +
      `value from vitest.config.ts, so these tests would exercise a fake. The ` +
      `live project must load apps/voice/.env, not the dummy test environment.`,
  );
}

const REQUIRED = ["DATABASE_URL", "CLERK_SECRET_KEY"] as const;
const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `[live] missing ${missing.join(", ")}. These tests need real credentials — ` +
      `fill in apps/voice/.env before running \`pnpm -F backend test:live\`.`,
  );
}
