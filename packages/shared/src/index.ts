export * from "./schemas.js";

// Domain enums / unions

export type CallOutcome = "answered" | "booked" | "escalated" | "abandoned" | "error";
export type EscalationStatus = "pending" | "resolved";
export type AppointmentStatus = "requested" | "confirmed" | "cancelled";

/**
 * Plays before the owner's greeting and is not editable. California AB 2905 and
 * SB 243 require it before any substantive interaction, at $500 per call.
 */
export const AI_DISCLOSURE_RECORDED =
  "Just so you know, you're speaking with an AI assistant, and this call is recorded.";

/** The AI half is never optional. The recording clause is, because it is a claim. */
export const AI_DISCLOSURE_NOT_RECORDED =
  "Just so you know, you're speaking with an AI assistant.";

/** Two concurrent wordings with stable ids, stamped on every call as the audit trail. */
export const DISCLOSURE_VERSION_RECORDED = "2026-08-v1";
export const DISCLOSURE_VERSION_NOT_RECORDED = "2026-08-norec-v1";

export type Disclosure = { text: string; version: string };

/** Text and id together, so a call cannot be stamped with a wording it never heard. */
export function disclosureFor(recordCalls: boolean): Disclosure {
  return recordCalls
    ? { text: AI_DISCLOSURE_RECORDED, version: DISCLOSURE_VERSION_RECORDED }
    : { text: AI_DISCLOSURE_NOT_RECORDED, version: DISCLOSURE_VERSION_NOT_RECORDED };
}

/** A union of one, so no column has to name a vendor. */
export type CalendarProvider = "google";

/** Who sold the number. `manual` is one the operator wired up themselves. */
export type PhoneNumberProvider = "livekit" | "twilio" | "telnyx" | "manual";

/** Display data for the connected calendar. Never read on the call path. */
export type CalendarPayload = {
  /** The calendar's own name, so Settings can show "Bookings", not a raw id. */
  summary: string;
  /** The calendar's timezone as the provider reports it, for display only. */
  timeZone?: string;
};

/** One of the calendars a connected account can offer, for the picker. */
export interface CalendarOption {
  id: string;
  summary: string;
  timeZone?: string;
  primary: boolean;
}

/** A line of the conversation, as plain text. Carries no timing: chat message
 *  timestamps do not line up with the recording. */
export type TranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

/** Dashboard response types are inferred from the handlers in `apps/web/src/lib/api-types.ts`. */
