import { describe, it, expect, vi } from "vitest";

/**
 * An agent with recordCalls true and no storage must still be told the truth:
 * the disclosure and the egress guard both read recordingEnabled, never the flag.
 */
vi.mock("../env.js", () => ({
  env: {
    LIVEKIT_URL: "wss://test.livekit.cloud",
    LIVEKIT_API_KEY: "test-key",
    LIVEKIT_API_SECRET: "test-secret",
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET_NAME: undefined,
  },
}));

const { storageConfigured, recordingEnabled, startCallRecording } =
  await import("./storage.js");

describe("recordingEnabled", () => {
  it("is false with no storage, whatever the agent asked for", () => {
    expect(storageConfigured).toBe(false);
    expect(recordingEnabled({ recordCalls: true })).toBe(false);
    expect(recordingEnabled({ recordCalls: false })).toBe(false);
  });

  it("refuses to start an egress it cannot upload", async () => {
    await expect(startCallRecording("room", "call")).rejects.toThrow(/R2_\*/);
  });
});
