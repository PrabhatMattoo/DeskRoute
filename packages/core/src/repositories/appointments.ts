import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { appointments } from "../db/schema.js";

export type AppointmentRow = typeof appointments.$inferSelect;

type CreateAppointmentInput = {
  agentId: string;
  callerId: string | null;
  callerPhone: string | null;
  /** Independent of `callers.name`: an anonymous caller has no row to hang it on. */
  callerName?: string | null;
  /** The service record this was booked against; null if it is since deleted. */
  serviceId?: string | null;
  serviceName: string;
  startTime: Date;
  endTime: Date;
  /** The padded block to reserve. Omit for a request that holds no time. */
  blockStart?: Date | null;
  blockEnd?: Date | null;
  status: "requested" | "confirmed" | "cancelled";
  externalEventId?: string;
};

/** Another caller booked the same block first. */
export class SlotTaken extends Error {
  constructor() {
    super("That block is already held by a confirmed appointment.");
    this.name = "SlotTaken";
  }
}

const EXCLUSION_VIOLATION = "23P01";
const OVERLAP_CONSTRAINT = "appointments_no_overlap";

/** Drizzle wraps the driver error, so the pg code and constraint sit on `cause`. */
function isSlotTaken(err: unknown): boolean {
  for (
    let e = err, depth = 0;
    e && depth < 5;
    e = (e as { cause?: unknown }).cause, depth++
  ) {
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code === EXCLUSION_VIOLATION && constraint === OVERLAP_CONSTRAINT) return true;
  }
  return false;
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<AppointmentRow> {
  try {
    const rows = await db
      .insert(appointments)
      .values({
        agentId: input.agentId,
        callerId: input.callerId,
        callerPhone: input.callerPhone,
        callerName: input.callerName ?? null,
        serviceId: input.serviceId ?? null,
        serviceName: input.serviceName,
        startTime: input.startTime,
        endTime: input.endTime,
        blockStart: input.blockStart ?? null,
        blockEnd: input.blockEnd ?? null,
        status: input.status,
        externalEventId: input.externalEventId ?? null,
      })
      .returning();
    return rows[0];
  } catch (err) {
    if (isSlotTaken(err)) throw new SlotTaken();
    throw err;
  }
}

/** Written once the calendar event exists, so the row names a live event. */
export async function attachExternalEvent(
  appointmentId: string,
  externalEventId: string,
): Promise<void> {
  await db
    .update(appointments)
    .set({ externalEventId, updatedAt: new Date() })
    .where(eq(appointments.id, appointmentId));
}

/** Drops the confirmed row out of `appointments_no_overlap`, releasing the block. */
export async function releaseToRequested(appointmentId: string): Promise<void> {
  await db
    .update(appointments)
    .set({ status: "requested", blockStart: null, blockEnd: null, updatedAt: new Date() })
    .where(eq(appointments.id, appointmentId));
}

export async function listAppointments(agentId: string) {
  return db
    .select({
      id: appointments.id,
      callerPhone: appointments.callerPhone,
      callerName: appointments.callerName,
      service: appointments.serviceName,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      externalEventId: appointments.externalEventId,
      createdAt: appointments.createdAt,
    })
    .from(appointments)
    .where(eq(appointments.agentId, agentId))
    .orderBy(desc(appointments.startTime))
    .limit(100);
}

/** Non-null by design: querying with a placeholder reads one caller's
 *  appointments to another. */
export async function getUpcomingByPhone(agentId: string, callerPhone: string) {
  return db
    .select({
      id: appointments.id,
      service: appointments.serviceName,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      externalEventId: appointments.externalEventId,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.agentId, agentId),
        eq(appointments.callerPhone, callerPhone),
        gt(appointments.startTime, new Date()),
        ne(appointments.status, "cancelled"),
      ),
    )
    .orderBy(asc(appointments.startTime))
    .limit(10);
}

export async function cancelAppointmentById(
  appointmentId: string,
  agentId: string,
): Promise<AppointmentRow | null> {
  const rows = await db
    .update(appointments)
    .set({ status: "cancelled" })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.agentId, agentId)))
    .returning();
  return rows[0] ?? null;
}
