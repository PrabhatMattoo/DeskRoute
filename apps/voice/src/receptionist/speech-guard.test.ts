import { describe, it, expect } from "vitest";
import type { llm } from "@livekit/agents";
import { suppressSpeechOnToolTurns } from "./speech-guard.js";

/** Cheap tests over an expensive failure: a caller hearing the agent read its
 *  own tool-call JSON and deliberation aloud. */

const FLUSH = Symbol("flush");

function chunk(delta: Partial<llm.ChoiceDelta>): llm.ChatChunk {
  return { id: "c", delta: { role: "assistant", ...delta } as llm.ChoiceDelta };
}

function toolCall(name: string, args: string): llm.ChatChunk {
  return chunk({
    toolCalls: [{ callId: "call_1", name, args } as llm.FunctionCall],
  });
}

/** Runs a scripted chunk sequence through the guard and reports what survived. */
async function run(input: unknown[]) {
  const source = new ReadableStream<unknown>({
    start(controller) {
      for (const item of input) controller.enqueue(item);
      controller.close();
    },
  });

  const out: unknown[] = [];
  const reader = suppressSpeechOnToolTurns(source).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(value);
  }

  const spoken = out
    .map((c) =>
      typeof c === "string" ? c : ((c as llm.ChatChunk)?.delta?.content ?? ""),
    )
    .join("");
  const tools = out.flatMap((c) =>
    typeof c === "string"
      ? []
      : ((c as llm.ChatChunk)?.delta?.toolCalls ?? []).map((t) => t.name),
  );
  return { out, spoken, tools };
}

describe("a turn that calls a tool never speaks", () => {
  it("drops the exact leak seen in production", async () => {
    // Reconstructed from the worker log: JSON tail, then deliberation, then the
    // tool call — all in one turn.
    const { spoken, tools } = await run([
      chunk({ content: "_1} Wait, the user did not offer their name yet, " }),
      chunk({ content: "so I will book it directly. Let's call bookAppointment." }),
      toolCall("bookAppointment", '{"slotId":"slot_1"}'),
    ]);

    expect(spoken).toBe("");
    // The tool must still run — we are silencing the turn, not breaking it.
    expect(tools).toEqual(["bookAppointment"]);
  });

  it("drops text even when the tool call arrives first", async () => {
    // Order is not guaranteed, which is why the whole turn is buffered before
    // anything is emitted.
    const { spoken, tools } = await run([
      toolCall("checkAvailability", '{"service":"Haircut"}'),
      chunk({ content: "I should look this up now." }),
    ]);

    expect(spoken).toBe("");
    expect(tools).toEqual(["checkAvailability"]);
  });

  it("drops raw string chunks on a tool turn", async () => {
    const { spoken, tools } = await run(["thinking out loud", toolCall("endCall", "{}")]);

    expect(spoken).toBe("");
    expect(tools).toEqual(["endCall"]);
  });

  it("strips text from a chunk that carries both, keeping the call", async () => {
    const { spoken, tools } = await run([
      chunk({
        content: "Let me check.",
        toolCalls: [
          { callId: "c1", name: "checkAvailability", args: "{}" } as llm.FunctionCall,
        ],
      }),
    ]);

    expect(spoken).toBe("");
    expect(tools).toEqual(["checkAvailability"]);
  });
});

describe("an ordinary turn is untouched", () => {
  it("passes speech through when no tool is called", async () => {
    const { spoken, tools } = await run([
      chunk({ content: "We're open until five today. " }),
      chunk({ content: "Would you like to come in?" }),
    ]);

    expect(spoken).toBe("We're open until five today. Would you like to come in?");
    expect(tools).toEqual([]);
  });

  it("passes raw string chunks through when no tool is called", async () => {
    const { spoken } = await run(["Sure, ", "that works."]);
    expect(spoken).toBe("Sure, that works.");
  });

  it("never swallows a flush sentinel, on either kind of turn", async () => {
    const plain = await run([chunk({ content: "Hello." }), FLUSH]);
    expect(plain.out).toContain(FLUSH);

    const tool = await run([chunk({ content: "hmm" }), toolCall("endCall", "{}"), FLUSH]);
    expect(tool.out).toContain(FLUSH);
    expect(tool.spoken).toBe("");
  });

  it("preserves usage totals on a silenced turn", async () => {
    // Billing and metrics must survive; only the words are dropped.
    const usage = {
      completionTokens: 12,
      promptTokens: 400,
      promptCachedTokens: 0,
      totalTokens: 412,
    };
    const { out, spoken } = await run([
      chunk({ content: "deliberating" }),
      toolCall("checkAvailability", "{}"),
      { id: "c", usage } as llm.ChatChunk,
    ]);

    expect(spoken).toBe("");
    expect(out.some((c) => (c as llm.ChatChunk)?.usage?.totalTokens === 412)).toBe(true);
  });
});
