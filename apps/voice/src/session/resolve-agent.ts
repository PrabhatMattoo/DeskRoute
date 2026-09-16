import type { Service } from "@receptionist/shared";
import { LRUCache } from "@receptionist/core/lru.js";
import {
  getAgentById,
  getAgentByPhoneNumber,
  type AgentConfig,
} from "@receptionist/core/repositories/agents.js";
import { listServices } from "@receptionist/core/repositories/services.js";
import { listKnowledgeForPrompt } from "@receptionist/core/repositories/knowledge.js";
import type { KnowledgeEntry } from "../receptionist/prompt.js";

/** A config change, a new service and a new knowledge item all land within this. */
const AGENT_CACHE_TTL_MS = 5 * 60 * 1000;

export type ResolvedAgent = {
  agent: AgentConfig;
  services: Service[];
  knowledge: KnowledgeEntry[];
};

/** Cached together because all three are read on every call and go into one prompt. */
const cache = new LRUCache<string, ResolvedAgent & { expiresAt: number }>(500);

export async function resolveAgent(by: {
  agentId?: string;
  phoneNumber?: string;
}): Promise<ResolvedAgent | null> {
  const key = by.agentId ?? by.phoneNumber ?? "";
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return {
      agent: cached.agent,
      services: cached.services,
      knowledge: cached.knowledge,
    };
  }

  const agent = by.agentId
    ? await getAgentById(by.agentId)
    : await getAgentByPhoneNumber(by.phoneNumber!);
  if (!agent) return null;

  // The agent id is unknown until the first query resolves, so these two run
  // together rather than alongside it, costing no extra time to first audio.
  const [services, knowledge] = await Promise.all([
    listServices(agent.id),
    listKnowledgeForPrompt(agent.id),
  ]);

  cache.set(key, {
    agent,
    services,
    knowledge,
    expiresAt: Date.now() + AGENT_CACHE_TTL_MS,
  });
  return { agent, services, knowledge };
}
