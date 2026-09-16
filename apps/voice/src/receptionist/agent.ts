import { llm, voice } from "@livekit/agents";
import type { AgentDeps } from "./deps.js";
import { buildSystemPrompt } from "./prompt.js";
import { createAgentTools } from "./tools.js";
import { suppressSpeechOnToolTurns } from "./speech-guard.js";

/**
 * Its own module with no side effects: `worker.ts` calls `cli.runApp()` at the
 * top level, and `withMockTools` keys on the constructor.
 */
export class ReceptionistAgent extends voice.Agent {
  constructor(deps: AgentDeps) {
    super({
      instructions: buildSystemPrompt(deps),
      tools: createAgentTools(deps),
    });
  }

  /** Every spoken word passes through here, which is where the turn rule holds. */
  override async llmNode(
    chatCtx: llm.ChatContext,
    toolCtx: llm.ToolContext,
    modelSettings: voice.ModelSettings,
  ) {
    const source = await voice.Agent.default.llmNode(
      this,
      chatCtx,
      toolCtx,
      modelSettings,
    );
    if (!source) return null;
    // The cast is only for `ReadableStream`'s invariant generic; the transform
    // preserves the element type.
    return suppressSpeechOnToolTurns(source as ReadableStream<unknown>) as typeof source;
  }
}
