import { disclosureFor, type Disclosure } from "@receptionist/shared";

/**
 * The disclosure, then the agent's greeting. The wordings live in
 * `@receptionist/shared`, because the dashboard shows the owner what plays.
 */
export {
  AI_DISCLOSURE_RECORDED,
  AI_DISCLOSURE_NOT_RECORDED,
  DISCLOSURE_VERSION_RECORDED,
  DISCLOSURE_VERSION_NOT_RECORDED,
  disclosureFor,
} from "@receptionist/shared";

export type { Disclosure } from "@receptionist/shared";

/**
 * Falls back to the disclosure alone when the greeting is blank. Returns the
 * version with the text, so a call cannot be stamped with a wording it never heard.
 */
export function buildGreeting(agentGreeting: string, recordCalls: boolean): Disclosure {
  const disclosure = disclosureFor(recordCalls);
  const greeting = agentGreeting.trim();

  return {
    text: greeting ? `${disclosure.text} ${greeting}` : disclosure.text,
    version: disclosure.version,
  };
}
