import { describe, it, expect } from "vitest";
import { resolveCallerPhone } from "./caller.js";

/**
 * A placeholder identity becomes the upsert key for `callers` and the lookup key
 * in `getUpcomingByPhone`, collapsing every anonymous caller into one row.
 */
describe("resolveCallerPhone", () => {
  it("returns the caller's number when present", () => {
    expect(resolveCallerPhone({ "sip.phoneNumber": "+14155550123" }, false)).toBe(
      "+14155550123",
    );
  });

  it("returns null — not 'unknown' — when caller ID is withheld", () => {
    expect(resolveCallerPhone({}, false)).toBeNull();
  });

  it("returns null when caller ID is present but blank", () => {
    expect(resolveCallerPhone({ "sip.phoneNumber": "" }, false)).toBeNull();
    expect(resolveCallerPhone({ "sip.phoneNumber": "   " }, false)).toBeNull();
  });

  it("never conflates two withheld callers into one identity", () => {
    // The bug in one line: both of these were "unknown", and "unknown" is a
    // unique key.
    const a = resolveCallerPhone({}, false);
    const b = resolveCallerPhone({}, false);
    expect(a).toBeNull();
    expect(b).toBeNull();
    // null is not a usable identity, so nothing downstream can key on it.
    expect(a === "unknown" || b === "unknown").toBe(false);
  });

  it("returns null for browser test sessions — there is no real caller", () => {
    expect(resolveCallerPhone({ "sip.phoneNumber": "+14155550123" }, true)).toBeNull();
  });
});
