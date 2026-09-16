import { describe, it, expect } from "vitest";
import { voice } from "@livekit/agents";

const { FakeLLM, withMockTools } = voice.testing;
import { ReceptionistAgent } from "./agent.js";
import { makeAgentDeps } from "./fixtures.js";

/**
 * Whether the agent says the answer a tool produced. Drives a real `AgentSession`
 * offline: scripted LLM, mocked tool, and the reply asserted into the conversation.
 */

const SLOTS = {
  service: "Haircut",
  slots: [
    { slotId: "slot_1", time: "Fri Aug 28, 12:00 PM" },
    { slotId: "slot_2", time: "Fri Aug 28, 12:15 PM" },
    { slotId: "slot_3", time: "Fri Aug 28, 12:30 PM" },
  ],
};

const USER_ASKS = "Are there any slots in the afternoon?";
const REPLY = "I have 12:00 PM, 12:15 PM and 12:30 PM. Would any of those work?";

/** The framework hands the tool's return value to the model as a JSON string. */
const TOOL_OUTPUT = JSON.stringify(SLOTS);

function scriptedLLM() {
  return new FakeLLM([
    // Turn 1: the model decides to call the tool and says nothing.
    {
      input: USER_ASKS,
      toolCalls: [
        {
          name: "checkAvailability",
          // nullable, not optional — the schema requires all three keys.
          args: { service: "Haircut", preferredDate: null, partOfDay: "afternoon" },
        },
      ],
    },
    // Turn 2: keyed on the tool's output, the model writes the answer.
    { input: TOOL_OUTPUT, content: REPLY },
  ]);
}

describe("the reply after a tool call", () => {
  it("reaches the conversation", async () => {
    using _mocks = withMockTools(ReceptionistAgent, {
      checkAvailability: async () => SLOTS,
    });

    const session = new voice.AgentSession({ llm: scriptedLLM() });
    await session.start({ agent: new ReceptionistAgent(makeAgentDeps()) });

    try {
      const result = await session.run({ userInput: USER_ASKS }).wait();

      const spoken = result.events
        .filter((e) => e.type === "message")
        .map((e) => (e as { item?: { textContent?: string } }).item?.textContent ?? "")
        .join(" ");

      console.log(
        "EVENTS:",
        JSON.stringify(
          result.events.map((e) => ({
            type: e.type,
            text: (e as any).item?.textContent,
            name: (e as any).item?.name,
            output: (e as any).item?.output,
          })),
          null,
          1,
        ),
      );
      const calledTool = result.events.some((e) => e.type === "function_call");

      expect(calledTool, "the tool should have been called").toBe(true);
      expect(
        spoken,
        `the tool's answer was never spoken. events: ${result.events.map((e) => e.type).join(", ")}`,
      ).toContain("12:30 PM");
    } finally {
      await session.close?.();
    }
  }, 30_000);
});
