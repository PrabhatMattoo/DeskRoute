import { sql } from "drizzle-orm";
import { beforeAll, beforeEach } from "vitest";
import { db } from "@receptionist/core/db/client.js";

/**
 * Migrations run in the `test:int` script, not here: `migrations.int.test.ts`
 * asserts the chain against a genuinely empty database and this would poison it.
 */

const TABLES = [
  "appointments",
  "knowledge_items",
  "escalations",
  "calls",
  "callers",
  "phone_numbers",
  "agents",
] as const;

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    throw new Error(
      "Cannot reach the test database. Start it with `docker compose up -d` " +
        "from the repo root, then re-run.\n" +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

// One TRUNCATE ... CASCADE per test. Faster than per-table DELETE and it resets
// nothing else, so tests stay order-independent.
beforeEach(async () => {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} CASCADE`));
});
