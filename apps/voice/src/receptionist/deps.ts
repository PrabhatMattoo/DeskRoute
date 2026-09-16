import type { Service } from "@receptionist/shared";
import type { Slot } from "@receptionist/core/domain/scheduling.js";
import type { AgentConfig } from "@receptionist/core/repositories/agents.js";
import type { CallerRow } from "@receptionist/core/repositories/callers.js";
import type { KnowledgeEntry } from "./prompt.js";

export type CallState = {
  wasBooked: boolean;
  wasEscalated: boolean;
};

/** A slot the agent offered, with the service it was computed for. */
export type HeldSlot = { slot: Slot; service: Service };

/**
 * Opaque handles, so the model never sees or invents a timestamp and nothing is
 * bookable that was not offered. Per call: an offer lasts the conversation.
 */
export type SlotStore = {
  held: Map<string, HeldSlot>;
  nextId: number;
};

export type AgentDeps = {
  agent: AgentConfig;
  /** Cached with the agent, because slot generation needs their durations. */
  services: Service[];
  caller: CallerRow | null; // null briefly during greeting; populated before any tool can fire
  /** null when the caller withheld their number — see agent/caller.ts. */
  callerPhone: string | null;
  callId: string; // generated locally via crypto.randomUUID() — never empty
  /**
   * True once the `calls` row exists. Anything writing a foreign key to it awaits
   * this, rather than the insert moving onto the path to first audio. Never rejects.
   */
  callRowReady: Promise<boolean>;
  getGoogleToken: () => Promise<string | null>;
  /**
   * The connected calendar's id in its provider's system, or null when no
   * calendar has been chosen. The provider is on `agent.calendarProvider`.
   */
  calendarExternalId: string | null;
  /**
   * The agent's whole knowledge base, inlined into the system prompt at call
   * start. Replaces the searchKnowledge tool — see PLAN.md 1.5.
   */
  knowledge: KnowledgeEntry[];
  callState: CallState;
  slots: SlotStore;
};
