/** Postgres SQLSTATE codes the repositories turn into typed errors. */
export const UNIQUE_VIOLATION = "23505";
export const EXCLUSION_VIOLATION = "23P01";

const MAX_DEPTH = 5;

/** Drizzle wraps the driver error, so the pg code and constraint sit on `cause`. */
export function violates(err: unknown, code: string, constraint: string): boolean {
  let current = err;
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    const pg = current as { code?: string; constraint?: string; cause?: unknown };
    if (pg.code === code && pg.constraint === constraint) return true;
    current = pg.cause;
  }
  return false;
}
