import { describe, it, expect, vi } from "vitest";
import { buildSessionConfig } from "./pipeline.js";

/**
 * Pins the pipeline: `turnDetection` left undefined, telephony noise cancellation
 * on SIP only, and keyterms fed from the business and service names.
 */
describe("buildSessionConfig", () => {
  const vad = { label: "fake-vad" } as never;

  describe("turn detection", () => {
    it("leaves turnDetection unset so the SDK provisions the audio detector", () => {
      const { sessionOptions } = buildSessionConfig({ isTestSession: false, vad });

      // Explicitly present-but-undefined is fine; a MultilingualModel is not.
      expect(sessionOptions.turnHandling?.turnDetection).toBeUndefined();
    });

    it("keeps preemptive generation but never speaks a guess", () => {
      // TTS must not run before the turn is confirmed: a discarded guess that has
      // already become audio is audio the caller may have heard.
      const { sessionOptions } = buildSessionConfig({ isTestSession: false, vad });
      expect(sessionOptions.turnHandling?.preemptiveGeneration).toEqual({
        preemptiveTts: false,
      });
    });
  });

  describe("noise cancellation", () => {
    it("applies telephony cancellation to SIP calls", () => {
      const { inputOptions } = buildSessionConfig({ isTestSession: false, vad });
      expect(inputOptions.noiseCancellation).toBeDefined();
    });

    it("does NOT apply it to browser test sessions", () => {
      const { inputOptions } = buildSessionConfig({ isTestSession: true, vad });
      expect(inputOptions.noiseCancellation).toBeUndefined();
    });
  });

  describe("LLM provider switch", () => {
    /** Both gateways reachable by config rather than a code edit. */
    it("defaults to LiveKit Inference", async () => {
      vi.resetModules();
      const { buildLLM } = await import("./pipeline.js");
      const { inference } = await import("@livekit/agents");

      expect(buildLLM("openai/gpt-4o-mini")).toBeInstanceOf(inference.LLM);
    });

    it("uses OpenRouter when LLM_PROVIDER says so", async () => {
      vi.resetModules();
      vi.stubEnv("LLM_PROVIDER", "openrouter");
      const { buildLLM } = await import("./pipeline.js");
      const openai = await import("@livekit/agents-plugin-openai");

      expect(buildLLM("anthropic/claude-haiku-4.5")).toBeInstanceOf(openai.LLM);

      vi.unstubAllEnvs();
      vi.resetModules();
    });
  });

  describe("keyterms", () => {
    /** The vocabulary streaming STT mangles most, and a misheard service name
     *  derails a booking. */
    it("biases STT toward the business and service names", () => {
      const { sessionOptions } = buildSessionConfig({
        isTestSession: false,
        vad,
        keyterms: ["Test Business", "Haircut", "Colour"],
      });

      expect(sessionOptions.keytermsOptions?.keyterms).toEqual(
        expect.arrayContaining(["Test Business", "Haircut", "Colour"]),
      );
    });

    it("omits keyterms entirely when there are none", () => {
      const { sessionOptions } = buildSessionConfig({ isTestSession: false, vad });
      expect(sessionOptions.keytermsOptions?.keyterms ?? []).toEqual([]);
    });
  });

  describe("speech models", () => {
    it("uses the current STT and TTS model versions", () => {
      const { sttModel, ttsModel } = buildSessionConfig({ isTestSession: false, vad });
      // universal-3-5-pro biases transcription on what the agent just said,
      // which is what fixes misheard names, times and phone numbers.
      expect(sttModel).toBe("assemblyai/universal-3-5-pro");
      // sonic-3 is on a deprecation path.
      expect(ttsModel).toBe("cartesia/sonic-3.5");
    });
  });
});
