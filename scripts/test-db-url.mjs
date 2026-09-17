import { execSync } from "node:child_process";

/** Names the compose default, for the message shown when Docker is unreachable. */
const FALLBACK_PORT = "5433";

/**
 * Compose publishes the test database on an ephemeral host port, so this asks
 * Docker which one it took. Always the test container, never the development one.
 */
export function testDatabaseUrl() {
  let port = FALLBACK_PORT;
  try {
    const mapped = execSync("docker compose port test-db 5432", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const published = mapped.split(":").pop();
    if (published) port = published;
  } catch {
    // Docker is down. setup.int.ts reports the unreachable database.
  }
  return `postgresql://deskroute:deskroute@localhost:${port}/deskroute_test`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  process.stdout.write(testDatabaseUrl());
}
