import { describe, it, expect } from "vitest";
import { createAppointment, SlotTaken } from "../src/repositories/appointments.js";
import { makeAgent } from "./factories.js";

/**
 * Google reports the first write only after it propagates, so
 * `appointments_no_overlap` is what stops the second caller taking one slot.
 */

const AT = (iso: string) => new Date(iso);

const booking = (agentId: string, blockStart: Date, blockEnd: Date) => ({
  agentId,
  callerId: null,
  callerPhone: "+14155550123",
  serviceName: "Haircut",
  startTime: blockStart,
  endTime: blockEnd,
  blockStart,
  blockEnd,
  status: "confirmed" as const,
});

describe("appointments_no_overlap", () => {
  it("rejects a second confirmed booking over the same block", async () => {
    const agent = await makeAgent();
    await createAppointment(
      booking(agent.id, AT("2026-10-01T14:00:00Z"), AT("2026-10-01T15:00:00Z")),
    );

    await expect(
      createAppointment(
        booking(agent.id, AT("2026-10-01T14:30:00Z"), AT("2026-10-01T15:30:00Z")),
      ),
    ).rejects.toBeInstanceOf(SlotTaken);
  });

  it("allows back-to-back bookings that only touch", async () => {
    const agent = await makeAgent();
    await createAppointment(
      booking(agent.id, AT("2026-10-01T14:00:00Z"), AT("2026-10-01T15:00:00Z")),
    );

    await expect(
      createAppointment(
        booking(agent.id, AT("2026-10-01T15:00:00Z"), AT("2026-10-01T16:00:00Z")),
      ),
    ).resolves.toBeDefined();
  });

  it("does not hold a block for another agent", async () => {
    const [one, two] = [await makeAgent(), await makeAgent()];
    await createAppointment(
      booking(one.id, AT("2026-10-01T14:00:00Z"), AT("2026-10-01T15:00:00Z")),
    );

    await expect(
      createAppointment(
        booking(two.id, AT("2026-10-01T14:00:00Z"), AT("2026-10-01T15:00:00Z")),
      ),
    ).resolves.toBeDefined();
  });

  it("frees the block once the appointment is cancelled", async () => {
    const agent = await makeAgent();
    await createAppointment({
      ...booking(agent.id, AT("2026-10-01T14:00:00Z"), AT("2026-10-01T15:00:00Z")),
      status: "cancelled",
    });

    await expect(
      createAppointment(
        booking(agent.id, AT("2026-10-01T14:00:00Z"), AT("2026-10-01T15:00:00Z")),
      ),
    ).resolves.toBeDefined();
  });

  // A request holds no time, so it must not reserve one. tstzrange(NULL, NULL) is
  // the infinite range, which without the constraint's NULL guard would.
  it("lets any number of requests sit without a block", async () => {
    const agent = await makeAgent();
    const request = {
      ...booking(agent.id, AT("2026-10-01T14:00:00Z"), AT("2026-10-01T15:00:00Z")),
      blockStart: null,
      blockEnd: null,
      status: "requested" as const,
    };

    await createAppointment(request);
    await createAppointment(request);

    await expect(
      createAppointment(
        booking(agent.id, AT("2026-10-01T14:00:00Z"), AT("2026-10-01T15:00:00Z")),
      ),
    ).resolves.toBeDefined();
  });

  it("lets exactly one of two simultaneous bookings through", async () => {
    const agent = await makeAgent();
    const slot = booking(
      agent.id,
      AT("2026-10-05T09:00:00Z"),
      AT("2026-10-05T10:00:00Z"),
    );

    const results = await Promise.allSettled([
      createAppointment(slot),
      createAppointment(slot),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(SlotTaken);
  });
});
