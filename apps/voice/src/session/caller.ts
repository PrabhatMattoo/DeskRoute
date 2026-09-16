/**
 * Null for a withheld number, never a placeholder: a placeholder is a shared
 * upsert and lookup key, and reads one caller's appointments to the next.
 */
export function resolveCallerPhone(
  attributes: Record<string, string | undefined>,
  isTestSession: boolean,
): string | null {
  // Browser test sessions have no caller at all.
  if (isTestSession) return null;

  const raw = attributes["sip.phoneNumber"]?.trim();
  return raw ? raw : null;
}
