import { describe, it, expect, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Migrates into a freshly created database and drops it after, so the chain is
 * proven against genuinely empty state and never touches the shared test database.
 */

const ADMIN_URL = process.env.DATABASE_URL!;
const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);

let scratchDb: string | null = null;

async function withAdmin<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: ADMIN_URL, max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

afterEach(async () => {
  if (!scratchDb) return;
  const name = scratchDb;
  scratchDb = null;
  await withAdmin(async (pool) => {
    await pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  });
});

describe("migration chain", () => {
  it("runs to completion against an empty database", async () => {
    const name = `migration_check_${Date.now()}`;
    await withAdmin((pool) => pool.query(`CREATE DATABASE "${name}"`));
    scratchDb = name;

    const url = new URL(ADMIN_URL);
    url.pathname = `/${name}`;
    const pool = new Pool({ connectionString: url.toString(), max: 1 });

    try {
      await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });

      const tables = await drizzle(pool).execute(sql`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
      `);
      const names = tables.rows.map((r) => (r as { tablename: string }).tablename);

      expect(names).toEqual(
        expect.arrayContaining([
          "agents",
          "appointments",
          "callers",
          "calls",
          "escalations",
          "knowledge_items",
          "phone_numbers",
          "services",
        ]),
      );
    } finally {
      await pool.end();
    }
  }, 60_000);
});
