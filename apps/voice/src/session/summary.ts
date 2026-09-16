import { llm } from "@livekit/agents";
import type { TranscriptEntry } from "@receptionist/core/db/schema.js";
import { env } from "../env.js";
import { buildLLM } from "./pipeline.js";

const SUMMARY_PROMPT = `Summarize this phone call in 3-4 sentences. Focus on:
- What the caller wanted
- What was resolved or answered
- Any follow-ups needed (escalations, callbacks, pending bookings)
Keep it factual and concise. Do not use bullet points.`;

const MIN_SUMMARY_ENTRIES = 3;

/**
 * The same gateway as the in-call model, so the two cannot drift. A small model
 * with reasoning off: larger ones embellish and invent follow-ups.
 */
export async function generateCallSummary(
  transcript: TranscriptEntry[],
): Promise<string> {
  if (transcript.length < MIN_SUMMARY_ENTRIES) return "";

  const formatted = transcript
    .map((entry) => `${entry.role === "user" ? "Caller" : "Agent"}: ${entry.text}`)
    .join("\n");

  const model = buildLLM(env.SUMMARY_LLM_MODEL);

  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({ role: "system", content: SUMMARY_PROMPT });
  chatCtx.addMessage({ role: "user", content: formatted });

  try {
    const stream = model.chat({ chatCtx });
    let text = "";
    for await (const chunk of stream) {
      const delta = chunk.delta?.content;
      if (delta) text += delta;
    }
    const summary = text.trim();
    if (!summary) {
      // Providers do not always throw: a 402 yields an empty stream and no
      // exception, so silence is a signal.
      console.warn(
        `[summary] model ${env.SUMMARY_LLM_MODEL} via ${env.LLM_PROVIDER} returned nothing; ` +
          `check provider credits or quota`,
      );
    }
    return summary;
  } catch (err) {
    // A missing summary is not worth failing call finalization over — the
    // transcript, outcome and recording are all still written.
    console.error(
      "[summary] generation failed:",
      err instanceof Error ? err.message : err,
    );
    return "";
  } finally {
    await model.aclose().catch(() => {});
  }
}
