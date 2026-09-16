import { inference, llm, voice } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import type * as silero from "@livekit/agents-plugin-silero";
import { TelephonyBackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import { env } from "../env.js";

/**
 * Pinned in one place and asserted in tests. universal-3-5-pro biases
 * transcription on what the agent just said, which is what fixes misheard names.
 */
export const STT_MODEL = "assemblyai/universal-3-5-pro" as const;
export const TTS_MODEL = "cartesia/sonic-3.5" as const;
const TTS_VOICE = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";

export type SessionConfigInput = {
  /** Browser test session from the dashboard, rather than a real SIP call. */
  isTestSession: boolean;
  vad: silero.VAD;
  /** Biased into STT: a misheard service name derails a booking. */
  keyterms?: string[];
};

export type SessionConfig = {
  sessionOptions: voice.AgentSessionOptions;
  inputOptions: Partial<voice.RoomInputOptions>;
  sttModel: typeof STT_MODEL;
  ttsModel: typeof TTS_MODEL;
};

/**
 * LiveKit Inference shares the gateway with STT and TTS, saving a hop on the
 * call path. OpenRouter widens model choice and needs credits on the account.
 */
export function buildLLM(model: string): llm.LLM {
  if (env.LLM_PROVIDER === "openrouter") {
    return new openai.LLM({
      model,
      baseURL: env.OPENROUTER_BASE_URL,
      apiKey: env.OPENROUTER_API_KEY,
    });
  }
  return new inference.LLM({ model: model as inference.LLMModels });
}

/** Business and service names, de-duplicated, so this module needs no agent type. */
export function buildKeyterms(businessName: string, serviceNames: string[]): string[] {
  return [
    ...new Set([businessName, ...serviceNames].map((t) => t?.trim()).filter(Boolean)),
  ];
}

/** Pure, so the pipeline is assertable without booting a worker. */
export function buildSessionConfig({
  isTestSession,
  vad,
  keyterms = [],
}: SessionConfigInput): SessionConfig {
  const sessionOptions: voice.AgentSessionOptions = {
    vad,
    stt: new inference.STT({ model: STT_MODEL, language: "en" }),
    llm: buildLLM(env.LLM_MODEL),
    tts: new inference.TTS({ model: TTS_MODEL, voice: TTS_VOICE }),
    // One keyterm set, applied to whichever STT accepts a term list.
    keytermsOptions: { keyterms },
    turnHandling: {
      // Left undefined on purpose: that provisions the audio TurnDetector and
      // drops the endpointing floor to 300/2500ms. Setting anything forfeits both.
      turnDetection: undefined,
      // Preemptive generation is the latency win and a discarded guess costs
      // only tokens. preemptiveTts turns that guess into audio already in flight.
      preemptiveGeneration: { preemptiveTts: false },
    },
  };

  return {
    sessionOptions,
    inputOptions: {
      // Runs before VAD, STT and turn detection, so it is an accuracy fix. Tuned
      // for 8kHz phone audio, so a laptop microphone is the wrong input for it.
      ...(isTestSession
        ? {}
        : { noiseCancellation: TelephonyBackgroundVoiceCancellation() }),
    },
    sttModel: STT_MODEL,
    ttsModel: TTS_MODEL,
  };
}
