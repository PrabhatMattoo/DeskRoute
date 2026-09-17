import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { createAgentTools } from "./tools.js";
import { makeAgentDeps } from "./fixtures.js";
import { createEscalation } from "@receptionist/core/repositories/escalations.js";
import { setCallerName } from "@receptionist/core/repositories/callers.js";
import {
  createAppointment,
  SlotTaken,
} from "@receptionist/core/repositories/appointments.js";
import { createCalendarEvent } from "@receptionist/core/providers/calendar.js";

/**
 * Every tool's `execute` must return a value to the model. A tool that resolves
 * to a closure reports success with no output, and typecheck cannot see it.
 */

const okCalendar = () =>
  makeAgentDeps({
    calendarExternalId: "cal-1",
    getGoogleToken: async () => "token-1",
  });

beforeEach(() => {
  vi.restoreAllMocks();
  // `restoreAllMocks` only undoes spies, so plain `vi.fn()` history survives and
  // `mock.calls[0]` becomes the first test's call.
  vi.clearAllMocks();
});

vi.mock("@receptionist/core/providers/calendar.js", () => ({
  fetchBusyRanges: vi.fn(async () => []),
  createCalendarEvent: vi.fn(async () => "evt-1"),
  deleteCalendarEvent: vi.fn(async () => {}),
}));

vi.mock("@receptionist/core/repositories/appointments.js", () => ({
  createAppointment: vi.fn(async () => ({ id: "appt-1" })),
  attachExternalEvent: vi.fn(async () => {}),
  releaseToRequested: vi.fn(async () => {}),
  getUpcomingByPhone: vi.fn(async () => []),
  cancelAppointmentById: vi.fn(async () => null),
  SlotTaken: class SlotTaken extends Error {},
}));

vi.mock("@receptionist/core/repositories/escalations.js", () => ({
  createEscalation: vi.fn(async () => ({ id: "esc-1" })),
}));

vi.mock("@receptionist/core/repositories/callers.js", () => ({
  setCallerName: vi.fn(async () => null),
}));

/** The RunContext the SDK passes; only `session` is touched by these tools. */
const runCtx = () => ({ ctx: { session: { say: vi.fn(), shutdown: vi.fn() } } }) as never;

/** Escalation also reaches for `speechHandle`, to stop being interrupted. */
const escalationCtx = () =>
  ({ ctx: { speechHandle: {}, session: { say: vi.fn() } } }) as never;

/** The booking tools reach the model only for a business that lists services. */
const bookingTools = (deps = okCalendar()) => {
  const tools = createAgentTools(deps);
  if (!("checkAvailability" in tools)) throw new Error("this fixture lists no services");
  return tools;
};

describe("every tool returns a result to the model", () => {
  it("checkAvailability returns slots, not a function", async () => {
    const tools = bookingTools();
    const result = await tools.checkAvailability.execute(
      { service: "Haircut", preferredDate: null, partOfDay: null },
      runCtx(),
    );

    expect(typeof result, "a tool must never resolve to a function").not.toBe("function");
    expect(result).toBeDefined();
    // Either real slots or an explicit note — never undefined, never a closure.
    expect(result).toEqual(
      expect.objectContaining({
        ...("slots" in result! ? {} : { note: expect.anything() }),
      }),
    );
    expect("slots" in result! || "note" in result! || "error" in result!).toBe(true);
  });

  it("bookAppointment returns a result for an unknown slot", async () => {
    const tools = bookingTools();
    const result = await tools.bookAppointment.execute(
      { slotId: "nope", callerName: "Prabhat" },
      runCtx(),
    );

    expect(typeof result).not.toBe("function");
    expect(result).toHaveProperty("error");
  });

  it("bookAppointment returns a result for a held slot", async () => {
    const deps = okCalendar();
    const tools = bookingTools(deps);

    // Offer a slot first, exactly as a real call does.
    const offered = (await tools.checkAvailability.execute(
      { service: "Haircut", preferredDate: null, partOfDay: null },
      runCtx(),
    )) as { slots?: { slotId: string }[] };

    const slotId = offered.slots?.[0]?.slotId;
    expect(slotId, "checkAvailability produced no bookable slot").toBeDefined();

    const result = await tools.bookAppointment.execute(
      { slotId: slotId!, callerName: "Prabhat" },
      runCtx(),
    );

    expect(typeof result).not.toBe("function");
    expect(result).toEqual(expect.objectContaining({ booked: true }));
  });

  it("lookupAppointments returns a result", async () => {
    const tools = createAgentTools(makeAgentDeps({ callerPhone: "+14155550123" }));
    const result = await tools.lookupAppointments.execute({}, runCtx());

    expect(typeof result).not.toBe("function");
    expect(result).toHaveProperty("appointments");
  });

  it("cancelAppointment returns a result", async () => {
    const tools = createAgentTools(okCalendar());
    const result = await tools.cancelAppointment.execute(
      { appointmentId: "appt-1" },
      runCtx(),
    );

    expect(typeof result).not.toBe("function");
    expect(result).toHaveProperty("error");
  });

  it("createEscalation returns a result", async () => {
    const tools = createAgentTools(makeAgentDeps());
    const result = await tools.createEscalation.execute(
      { question: "Do you have parking?", callerName: null, transcriptExcerpt: null },
      escalationCtx(),
    );

    expect(typeof result).not.toBe("function");
    expect(result).toEqual({ escalated: true });
  });
});

describe("the services a caller can ask for", () => {
  it("names the catalogue in the parameter the model fills in", () => {
    const tools = bookingTools();
    const shape = (tools.checkAvailability.parameters as z.ZodObject<z.ZodRawShape>)
      .shape;
    const service = shape.service as z.ZodEnum<[string, ...string[]]>;

    expect(service.options).toEqual(makeAgentDeps().services.map((s) => s.name));
  });
});

describe("a business that lists no services", () => {
  const noServices = () => createAgentTools(makeAgentDeps({ services: [] }));

  it("withholds the booking tools from the model", () => {
    const tools = noServices();

    expect("checkAvailability" in tools).toBe(false);
    expect("bookAppointment" in tools).toBe(false);
  });

  it("keeps every tool the caller still needs", () => {
    expect(Object.keys(noServices()).sort()).toEqual([
      "cancelAppointment",
      "createEscalation",
      "endCall",
      "lookupAppointments",
      "rememberCallerName",
    ]);
  });
});

/** Two callers offered one slot both clear the freeBusy re-check, so the database
 *  is the only place the second can be stopped. */
describe("a slot another caller took first", () => {
  const offerThenBook = async (slotCallerName = "Prabhat") => {
    const tools = bookingTools();
    const offered = (await tools.checkAvailability.execute(
      { service: "Haircut", preferredDate: null, partOfDay: null },
      runCtx(),
    )) as { slots?: { slotId: string }[] };

    return tools.bookAppointment.execute(
      { slotId: offered.slots![0]!.slotId, callerName: slotCallerName },
      runCtx(),
    );
  };

  it("is reported to the model", async () => {
    vi.mocked(createAppointment).mockRejectedValueOnce(new SlotTaken());

    const result = await offerThenBook();

    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("booked");
  });

  it("leaves no calendar event behind", async () => {
    vi.mocked(createAppointment).mockRejectedValueOnce(new SlotTaken());

    await offerThenBook();

    expect(vi.mocked(createCalendarEvent)).not.toHaveBeenCalled();
  });

  it("claims the row before writing the event, which is what makes that true", async () => {
    await offerThenBook();

    const claimed = vi.mocked(createAppointment).mock.invocationCallOrder[0]!;
    const written = vi.mocked(createCalendarEvent).mock.invocationCallOrder[0]!;
    expect(claimed).toBeLessThan(written);
  });

  it("reserves the padded block", async () => {
    await offerThenBook();

    const input = vi.mocked(createAppointment).mock.calls[0]![0];
    expect(input.blockStart).toBeInstanceOf(Date);
    expect(input.blockEnd).toBeInstanceOf(Date);
    expect(input.status).toBe("confirmed");
  });
});

/** Asking is enforced by the schema, so the model cannot escalate without
 *  confronting the field. */
describe("the caller's name", () => {
  it("is recorded on the escalation when the caller gives one", async () => {
    const tools = createAgentTools(makeAgentDeps());
    await tools.createEscalation.execute(
      { question: "Do you take cats?", callerName: "Dana", transcriptExcerpt: null },
      escalationCtx(),
    );

    expect(vi.mocked(createEscalation).mock.calls[0]?.[0]).toMatchObject({
      callerName: "Dana",
    });
  });

  it("is null when they were asked and declined", async () => {
    const tools = createAgentTools(makeAgentDeps());
    await tools.createEscalation.execute(
      { question: "Do you take cats?", callerName: null, transcriptExcerpt: null },
      escalationCtx(),
    );

    expect(vi.mocked(createEscalation).mock.calls[0]?.[0]).toMatchObject({
      callerName: null,
    });
  });

  it("falls back to the name already on the client row", async () => {
    // A returning caller who does not say their name again is still known.
    const tools = createAgentTools(
      makeAgentDeps({ caller: { id: "cli-1", name: "Marcus" } as never }),
    );
    await tools.createEscalation.execute(
      { question: "Do you take cats?", callerName: null, transcriptExcerpt: null },
      escalationCtx(),
    );

    expect(vi.mocked(createEscalation).mock.calls[0]?.[0]).toMatchObject({
      callerName: "Marcus",
    });
  });

  it("is remembered for the next call, through the same helper booking uses", async () => {
    // The point of extracting `resolveCallerName`: escalation persists the name
    // exactly as booking does, rather than carrying a second copy that drifts.
    vi.mocked(setCallerName).mockResolvedValueOnce({
      id: "cli-1",
      name: "Dana",
    } as never);

    const tools = createAgentTools(
      makeAgentDeps({ caller: { id: "cli-1", name: null } as never }),
    );
    await tools.createEscalation.execute(
      { question: "Do you take cats?", callerName: "  Dana  ", transcriptExcerpt: null },
      escalationCtx(),
    );

    expect(vi.mocked(setCallerName)).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "cli-1",
      "Dana",
    );
  });
});
