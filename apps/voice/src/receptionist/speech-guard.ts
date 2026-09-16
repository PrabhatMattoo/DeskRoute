import type { llm } from "@livekit/agents";

/**
 * A turn either calls a tool or it talks, so no caller hears tool-call JSON and
 * the model's deliberation. A rule about the turn's shape, not its words.
 */

/** True when this chunk carries words the caller would hear. */
function carriesSpeech(chunk: llm.ChatChunk | string): boolean {
  if (typeof chunk === "string") return chunk.length > 0;
  return Boolean(chunk.delta?.content);
}

function carriesToolCall(chunk: llm.ChatChunk | string): boolean {
  if (typeof chunk === "string") return false;
  return (chunk.delta?.toolCalls?.length ?? 0) > 0;
}

/** Keeps the tool call, usage and provider metadata the session still needs. */
function withoutSpeech(chunk: llm.ChatChunk): llm.ChatChunk {
  if (!chunk.delta) return chunk;
  const { content: _dropped, ...delta } = chunk.delta;
  return { ...chunk, delta: { ...delta } as llm.ChoiceDelta };
}

/** The stream stays generic: `ReadableStream` is invariant, so restating the
 *  element type would not unify with the SDK's signature. */
type Inspectable = llm.ChatChunk | string | symbol;

/** Buffers a turn to end of stream, because the tool call can arrive after the text. */
export function suppressSpeechOnToolTurns(
  source: ReadableStream<unknown>,
): ReadableStream<unknown> {
  return new ReadableStream<unknown>({
    async start(controller) {
      const reader = source.getReader();
      const buffered: unknown[] = [];
      let sawToolCall = false;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value as Inspectable;
          if (typeof chunk !== "symbol" && carriesToolCall(chunk)) sawToolCall = true;
          buffered.push(value);
        }

        for (const value of buffered) {
          const chunk = value as Inspectable;
          if (!sawToolCall || typeof chunk === "symbol") {
            controller.enqueue(value);
            continue;
          }
          // A tool turn: drop plain-string speech outright, and strip the text
          // off structured chunks while keeping the tool call they carry.
          if (typeof chunk === "string") continue;
          if (!carriesSpeech(chunk)) {
            controller.enqueue(value);
            continue;
          }
          const stripped = withoutSpeech(chunk);
          if (carriesToolCall(stripped) || stripped.usage) {
            controller.enqueue(stripped);
          }
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
    cancel(reason) {
      return source.cancel(reason);
    },
  });
}
