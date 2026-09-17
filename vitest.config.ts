import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./scripts/test-db-url.mjs";

/**
 * Split by filename: *.test.ts needs nothing, *.int.test.ts needs the Docker
 * Postgres, *.live.test.ts needs real credentials and spends tokens.
 */
const testEnv = {
  PORT: "8080",
  DATABASE_URL: testDatabaseUrl(),
  LIVEKIT_URL: "wss://test.livekit.cloud",
  LIVEKIT_API_KEY: "test-key",
  LIVEKIT_API_SECRET: "test-secret",
  CLERK_SECRET_KEY: "sk_test_dummy",
  LLM_MODEL: "anthropic/claude-haiku-4.5",
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  SUMMARY_LLM_MODEL: "openai/gpt-4o-mini",
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET_NAME: "test-bucket",
};

const base = { globals: true, environment: "node" as const, env: testEnv };
const roots = ["apps/api", "apps/voice", "packages/core", "packages/shared"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...base,
          name: "unit",
          include: roots.flatMap((r) => [
            `${r}/src/**/*.test.ts`,
            `${r}/tests/**/*.test.ts`,
          ]),
          exclude: roots.flatMap((r) => [
            `${r}/**/*.int.test.ts`,
            `${r}/**/*.live.test.ts`,
          ]),
          setupFiles: ["tests/setup.unit.ts"],
        },
      },
      {
        test: {
          ...base,
          name: "int",
          include: roots.flatMap((r) => [`${r}/**/*.int.test.ts`]),
          setupFiles: ["tests/setup.int.ts"],
          // One shared database, so a parallel file's truncate wipes another's fixtures.
          fileParallelism: false,
        },
      },
      {
        test: {
          // Not `base`: injecting testEnv would point live tests at the Docker
          // database and a dummy Clerk key. setup.live.ts loads the real values.
          globals: true,
          environment: "node" as const,
          name: "live",
          include: roots.flatMap((r) => [`${r}/**/*.live.test.ts`]),
          setupFiles: ["tests/setup.live.ts"],
          testTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
