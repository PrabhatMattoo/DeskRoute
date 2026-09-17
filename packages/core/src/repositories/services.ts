import { and, asc, eq, max } from "drizzle-orm";
import type { Service, ServiceDraft } from "@receptionist/shared";
import { db } from "../db/client.js";
import { services } from "../db/schema.js";
import { UNIQUE_VIOLATION, violates } from "../db/pg-error.js";

export type ServiceRow = typeof services.$inferSelect;

/** The agent names a service to book it, so two rows cannot answer to one name. */
export class DuplicateServiceName extends Error {
  constructor(readonly serviceName: string) {
    super(`This business already offers a service called "${serviceName}".`);
    this.name = "DuplicateServiceName";
  }
}

const NAME_CONSTRAINT = "services_agent_name_idx";

async function named<T>(serviceName: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (violates(err, UNIQUE_VIOLATION, NAME_CONSTRAINT)) {
      throw new DuplicateServiceName(serviceName);
    }
    throw err;
  }
}

const serviceFields = {
  id: services.id,
  name: services.name,
  price: services.price,
  description: services.description,
  durationMinutes: services.durationMinutes,
  bufferBeforeMinutes: services.bufferBeforeMinutes,
  bufferAfterMinutes: services.bufferAfterMinutes,
  requiredResources: services.requiredResources,
} as const;

/** In display order, projected to what the prompt and the keyterm list need. */
export async function listServices(agentId: string): Promise<Service[]> {
  const rows = await db
    .select(serviceFields)
    .from(services)
    .where(eq(services.agentId, agentId))
    .orderBy(asc(services.position), asc(services.createdAt));

  return rows.map((row) => ({
    ...row,
    description: row.description || undefined,
  }));
}

export async function createService(
  agentId: string,
  draft: ServiceDraft,
): Promise<Service> {
  // Append rather than insert at zero: a new service showing up at the top of
  // someone's list is a small surprise nobody asked for.
  const [{ value: highest }] = await db
    .select({ value: max(services.position) })
    .from(services)
    .where(eq(services.agentId, agentId));

  const rows = await named(draft.name, () =>
    db
      .insert(services)
      .values({
        agentId,
        name: draft.name,
        price: draft.price,
        description: draft.description ?? "",
        durationMinutes: draft.durationMinutes,
        bufferBeforeMinutes: draft.bufferBeforeMinutes,
        bufferAfterMinutes: draft.bufferAfterMinutes,
        requiredResources: draft.requiredResources,
        position: (highest ?? -1) + 1,
      })
      .returning(serviceFields),
  );

  const row = rows[0]!;
  return { ...row, description: row.description || undefined };
}

export async function updateService(
  agentId: string,
  id: string,
  patch: Partial<ServiceDraft>,
): Promise<Service | null> {
  const rows = await named(patch.name ?? "", () =>
    db
      .update(services)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(services.id, id), eq(services.agentId, agentId)))
      .returning(serviceFields),
  );

  const row = rows[0];
  return row ? { ...row, description: row.description || undefined } : null;
}

/** Appointments survive: `service_id` is SET NULL and `service_name` holds the
 *  name as it stood at booking. */
export async function deleteService(agentId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(services)
    .where(and(eq(services.id, id), eq(services.agentId, agentId)))
    .returning({ id: services.id });

  return rows.length > 0;
}

/** One transaction, so a failed insert cannot leave a half-built list. */
export async function replaceServices(
  agentId: string,
  drafts: ServiceDraft[],
): Promise<void> {
  const seen = new Set<string>();
  for (const draft of drafts) {
    const key = draft.name.trim().toLowerCase();
    if (seen.has(key)) throw new DuplicateServiceName(draft.name);
    seen.add(key);
  }

  await db.transaction(async (tx) => {
    await tx.delete(services).where(eq(services.agentId, agentId));
    if (drafts.length === 0) return;

    await tx.insert(services).values(
      drafts.map((draft, position) => ({
        agentId,
        name: draft.name,
        price: draft.price,
        description: draft.description ?? "",
        durationMinutes: draft.durationMinutes,
        bufferBeforeMinutes: draft.bufferBeforeMinutes,
        bufferAfterMinutes: draft.bufferAfterMinutes,
        requiredResources: draft.requiredResources,
        position,
      })),
    );
  });
}
