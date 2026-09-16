import { describe, it, expect } from "vitest";
import type { BookingPolicy, BusinessHours, Service } from "@receptionist/shared";
import {
  addDays,
  describeAppointmentWindow,
  describeDate,
  describeSlot,
  filterByBusy,
  findService,
  generateCandidateSlots,
  intervalsForDate,
  localDateIso,
  weekdayOf,
  zonedWallClockToUtc,
  type Slot,
} from "./scheduling.js";

const NY = "America/New_York";

const hours = (overrides: Partial<BusinessHours> = {}): BusinessHours => ({
  weekly: {
    mon: [{ start: "09:00", end: "17:00" }],
    tue: [{ start: "09:00", end: "17:00" }],
    wed: [{ start: "09:00", end: "17:00" }],
    thu: [{ start: "09:00", end: "17:00" }],
    fri: [{ start: "09:00", end: "17:00" }],
    sat: [],
    sun: [],
  },
  exceptions: [],
  ...overrides,
});

const policy = (overrides: Partial<BookingPolicy> = {}): BookingPolicy => ({
  minNoticeMinutes: 30,
  maxAdvanceDays: 60,
  ...overrides,
});

const service = (overrides: Partial<Service> = {}): Service => ({
  id: "svc-1",
  name: "Haircut",
  price: "$45",
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  requiredResources: [],
  ...overrides,
});

/** Wednesday 19 August 2026, 08:00 in New York (12:00 UTC). */
const WED_8AM_NY = new Date("2026-08-19T12:00:00Z");

const at = (slotStart: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: NY,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(slotStart);

describe("zonedWallClockToUtc", () => {
  it("converts a summer wall clock at the eastern offset", () => {
    // EDT is UTC-4, so 09:00 in New York is 13:00 UTC.
    expect(zonedWallClockToUtc("2026-08-19", "09:00", NY).toISOString()).toBe(
      "2026-08-19T13:00:00.000Z",
    );
  });

  it("converts a winter wall clock at the other offset", () => {
    // EST is UTC-5, so the same wall clock is a different instant in January.
    expect(zonedWallClockToUtc("2026-01-19", "09:00", NY).toISOString()).toBe(
      "2026-01-19T14:00:00.000Z",
    );
  });

  it("keeps opening time fixed across the spring-forward boundary", () => {
    // The whole reason hours are stored as wall clock: "we open at 9" must stay
    // 9 o'clock on both sides of the change, not shift by an hour.
    const before = zonedWallClockToUtc("2026-03-07", "09:00", NY);
    const after = zonedWallClockToUtc("2026-03-09", "09:00", NY);

    expect(at(before)).toBe("09:00");
    expect(at(after)).toBe("09:00");
    // ...even though the UTC instants are an hour apart in absolute terms.
    expect(after.getTime() - before.getTime()).not.toBe(2 * 86_400_000);
  });

  it("keeps opening time fixed across the autumn fall-back boundary", () => {
    expect(at(zonedWallClockToUtc("2026-10-31", "09:00", NY))).toBe("09:00");
    expect(at(zonedWallClockToUtc("2026-11-02", "09:00", NY))).toBe("09:00");
  });

  it("handles a zone with a half-hour offset", () => {
    expect(zonedWallClockToUtc("2026-08-19", "09:00", "Asia/Kolkata").toISOString()).toBe(
      "2026-08-19T03:30:00.000Z",
    );
  });

  it("handles midnight, which some ICU builds render as hour 24", () => {
    expect(at(zonedWallClockToUtc("2026-08-19", "00:00", NY))).toBe("00:00");
  });
});

describe("calendar helpers", () => {
  it("walks days across a month boundary", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("walks days across a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("names the weekday of a date", () => {
    expect(weekdayOf("2026-08-19")).toBe("wed");
    expect(weekdayOf("2026-08-23")).toBe("sun");
  });

  it("reads the local date, not the server's", () => {
    // 02:30 UTC on the 19th is still the evening of the 18th in New York.
    expect(localDateIso(new Date("2026-08-19T02:30:00Z"), NY)).toBe("2026-08-18");
  });
});

describe("intervalsForDate", () => {
  it("uses the weekly pattern by default", () => {
    expect(intervalsForDate(hours(), "2026-08-19")).toEqual([
      { start: "09:00", end: "17:00" },
    ]);
  });

  it("returns nothing for a day the business is closed", () => {
    expect(intervalsForDate(hours(), "2026-08-23")).toEqual([]);
  });

  it("lets an exception replace the weekly pattern outright", () => {
    const withHoliday = hours({
      exceptions: [{ date: "2026-08-19", intervals: [], label: "Staff training" }],
    });
    expect(intervalsForDate(withHoliday, "2026-08-19")).toEqual([]);
  });

  it("lets an exception open a normally closed day", () => {
    const withSaturday = hours({
      exceptions: [{ date: "2026-08-22", intervals: [{ start: "10:00", end: "14:00" }] }],
    });
    expect(intervalsForDate(withSaturday, "2026-08-22")).toEqual([
      { start: "10:00", end: "14:00" },
    ]);
  });
});

describe("generateCandidateSlots", () => {
  const generate = (input: Partial<Parameters<typeof generateCandidateSlots>[0]> = {}) =>
    generateCandidateSlots({
      hours: hours(),
      policy: policy(),
      service: service(),
      timeZone: NY,
      now: WED_8AM_NY,
      days: 0,
      ...input,
    });

  it("never offers a time outside opening hours", () => {
    // The bug this whole module exists for: a caller asking about tomorrow could
    // be offered 3 a.m.
    const times = generate().map((s) => at(s.start));
    expect(times.every((t) => t >= "09:00" && t <= "17:00")).toBe(true);
  });

  it("starts at opening time and ends so the appointment finishes by closing", () => {
    const slots = generate();
    expect(at(slots[0]!.start)).toBe("09:00");
    expect(at(slots.at(-1)!.start)).toBe("16:30");
  });

  it("returns nothing on a closed day", () => {
    expect(generate({ fromDate: "2026-08-23", days: 0 })).toEqual([]);
  });

  it("returns nothing on a holiday exception", () => {
    const withHoliday = hours({
      exceptions: [{ date: "2026-08-19", intervals: [], label: "Closed" }],
    });
    expect(generate({ hours: withHoliday })).toEqual([]);
  });

  it("respects a lunch closure as a real gap", () => {
    const withLunch = hours({
      weekly: {
        ...hours().weekly,
        wed: [
          { start: "09:00", end: "13:00" },
          { start: "14:00", end: "18:00" },
        ],
      },
    });

    const times = generate({ hours: withLunch }).map((s) => at(s.start));
    expect(times).toContain("12:30");
    expect(times).toContain("14:00");
    // Nothing may start inside the closure, nor run past its start.
    expect(times).not.toContain("13:00");
    expect(times).not.toContain("12:45");
  });

  it("uses the service's own length, not a fixed hour", () => {
    const [first] = generate({ service: service({ durationMinutes: 120 }) });
    expect(first!.end.getTime() - first!.start.getTime()).toBe(120 * 60_000);
  });

  it("stops earlier in the day for a longer service", () => {
    const short = generate({ service: service({ durationMinutes: 30 }) });
    const long = generate({ service: service({ durationMinutes: 120 }) });

    expect(at(short.at(-1)!.start)).toBe("16:30");
    expect(at(long.at(-1)!.start)).toBe("15:00");
  });

  it("drops setup time at the open, rather than moving it before you open", () => {
    // Setup protects the appointment before this one, and the first of the day
    // has nothing behind it.
    const padded = generate({
      service: service({ bufferBeforeMinutes: 10, bufferAfterMinutes: 15 }),
    });

    expect(at(padded[0]!.start)).toBe("09:00");
    expect(at(padded[0]!.blockStart)).toBe("09:00");
    expect(at(padded[0]!.blockEnd)).toBe("09:45");
  });

  it("drops cleanup time at the close, so the last appointment reaches closing", () => {
    // The appointment may end at close; the clearing up is not held on a calendar
    // the business has shut.
    const padded = generate({
      service: service({ bufferAfterMinutes: 15 }),
    });

    const last = padded.filter((s) => s.dateIso === "2026-08-19").at(-1)!;
    expect(at(last.start)).toBe("16:30");
    expect(at(last.end)).toBe("17:00");
    expect(at(last.blockEnd)).toBe("17:00");
  });

  it("keeps both paddings on a slot in the middle of the day", () => {
    const padded = generate({
      service: service({ bufferBeforeMinutes: 10, bufferAfterMinutes: 15 }),
    });

    const noon = padded.find((s) => at(s.start) === "12:00")!;
    expect(at(noon.blockStart)).toBe("11:50");
    expect(at(noon.blockEnd)).toBe("12:45");
  });

  it("treats each interval's own edges, not just the first and last of the day", () => {
    // A lunch split has four edges, not two. Reopening at 14:00 is as much an
    // open as 09:00 is, and 13:00 is as much a close as 18:00.
    const withLunch = hours({
      weekly: {
        ...hours().weekly,
        wed: [
          { start: "09:00", end: "13:00" },
          { start: "14:00", end: "18:00" },
        ],
      },
    });

    const padded = generate({
      hours: withLunch,
      service: service({ bufferBeforeMinutes: 10, bufferAfterMinutes: 15 }),
    }).filter((s) => s.dateIso === "2026-08-19");

    const reopen = padded.find((s) => at(s.start) === "14:00")!;
    expect(at(reopen.blockStart)).toBe("14:00");

    const beforeLunch = padded.filter((s) => at(s.start) < "13:00").at(-1)!;
    expect(at(beforeLunch.start)).toBe("12:30");
    expect(at(beforeLunch.blockEnd)).toBe("13:00");
  });

  it("offers appointment times on the grid, not wherever the padding pushed them", () => {
    // The loop walks appointment starts. Walking block starts instead offers
    // 09:10, 09:25, 09:40 — quarter past the wrong hour, every time.
    const padded = generate({
      service: service({ bufferBeforeMinutes: 10 }),
    })
      .filter((s) => s.dateIso === "2026-08-19")
      .slice(0, 3)
      .map((s) => at(s.start));

    expect(padded).toEqual(["09:00", "09:15", "09:30"]);
  });

  it("honours the minimum notice", () => {
    // 10:00 in New York, 45 minutes' notice — 10:30 is too soon, 10:45 is fine.
    const slots = generate({
      now: new Date("2026-08-19T14:00:00Z"),
      policy: policy({ minNoticeMinutes: 45 }),
    });

    expect(at(slots[0]!.start)).toBe("10:45");
  });

  it("offers a slot starting right now when notice is zero", () => {
    const slots = generate({
      now: new Date("2026-08-19T14:00:00Z"),
      policy: policy({ minNoticeMinutes: 0 }),
    });

    expect(at(slots[0]!.start)).toBe("10:00");
  });

  it("never searches past the booking window", () => {
    const slots = generate({ days: 365, policy: policy({ maxAdvanceDays: 2 }) });
    const lastDate = slots.at(-1)!.dateIso;

    expect(lastDate <= addDays("2026-08-19", 2)).toBe(true);
  });

  it("filters to a part of the day when the caller asked for one", () => {
    const times = generate({ partOfDay: "morning" }).map((s) => at(s.start));
    expect(times.every((t) => t < "12:00")).toBe(true);
    expect(times.length).toBeGreaterThan(0);
  });

  it("skips a closed day and finds the next open one", () => {
    // Asked about Sunday; Monday is the answer.
    const slots = generate({ fromDate: "2026-08-23", days: 2 });
    expect(slots[0]!.dateIso).toBe("2026-08-24");
  });
});

describe("filterByBusy", () => {
  const slots = generateCandidateSlots({
    hours: hours(),
    policy: policy(),
    service: service({ bufferAfterMinutes: 15 }),
    timeZone: NY,
    now: WED_8AM_NY,
    days: 0,
  });

  it("keeps everything when the calendar is empty", () => {
    expect(filterByBusy(slots, [])).toHaveLength(slots.length);
  });

  it("removes a slot overlapping a busy period", () => {
    const busy = [
      {
        start: new Date("2026-08-19T14:00:00Z"), // 10:00 NY
        end: new Date("2026-08-19T15:00:00Z"), // 11:00 NY
      },
    ];

    const times = filterByBusy(slots, busy).map((s) => at(s.start));
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).toContain("11:00");
  });

  it("counts cleanup time as a conflict, not just the appointment", () => {
    // Busy 11:00–11:10 NY. A 10:30 appointment ends at 11:00 but its 15 minutes
    // of cleanup run to 11:15, so it genuinely collides.
    const busy = [
      {
        start: new Date("2026-08-19T15:00:00Z"),
        end: new Date("2026-08-19T15:10:00Z"),
      },
    ];

    expect(filterByBusy(slots, busy).map((s) => at(s.start))).not.toContain("10:30");
  });

  it("allows a slot that ends exactly when a busy period starts", () => {
    const noPadding = generateCandidateSlots({
      hours: hours(),
      policy: policy(),
      service: service(),
      timeZone: NY,
      now: WED_8AM_NY,
      days: 0,
    });

    const busy = [
      {
        start: new Date("2026-08-19T15:00:00Z"), // 11:00 NY
        end: new Date("2026-08-19T16:00:00Z"),
      },
    ];

    // 10:30–11:00 touches the busy period without overlapping it.
    expect(filterByBusy(noPadding, busy).map((s) => at(s.start))).toContain("10:30");
  });
});

describe("describeSlot", () => {
  it("says a time the way a person would", () => {
    const [slot] = generateCandidateSlots({
      hours: hours(),
      policy: policy(),
      service: service(),
      timeZone: NY,
      now: WED_8AM_NY,
      days: 0,
    });

    expect(describeSlot(slot!, NY)).toBe("Wed Aug 19, 9:00 AM");
  });
});

describe("describeDate", () => {
  it("names a closed day for the caller", () => {
    expect(describeDate("2026-08-23", NY)).toBe("Sunday, August 23");
  });
});

describe("findService", () => {
  const services = [
    service({ id: "a", name: "Haircut" }),
    service({ id: "b", name: "Colour" }),
  ];

  it("matches exactly", () => {
    expect(findService(services, "Haircut")?.id).toBe("a");
  });

  it("ignores case and stray spaces", () => {
    expect(findService(services, "  colour ")?.id).toBe("b");
  });

  it("matches what a caller actually says", () => {
    // Speech-to-text rarely returns the catalogue name verbatim.
    expect(findService(services, "a haircut please")?.id).toBe("a");
  });

  it("refuses to guess between two candidates", () => {
    const ambiguous = [
      service({ id: "a", name: "Colour" }),
      service({ id: "b", name: "Colour correction" }),
    ];
    expect(findService(ambiguous, "colour")?.id).toBe("a");
    expect(findService(ambiguous, "col")).toBeNull();
  });

  it("returns null for something not offered", () => {
    expect(findService(services, "massage")).toBeNull();
  });
});

describe("describeAppointmentWindow", () => {
  const NY = "America/New_York";

  it("states the appointment window, not the padded block", () => {
    // The event spans 9:00–9:40 (30min haircut + 10min cleanup). The title must
    // say what was booked, which is 9:00–9:30.
    const slot: Slot = {
      start: new Date("2026-08-31T13:00:00Z"),
      end: new Date("2026-08-31T13:30:00Z"),
      blockStart: new Date("2026-08-31T13:00:00Z"),
      blockEnd: new Date("2026-08-31T13:40:00Z"),
      dateIso: "2026-08-31",
    };
    expect(describeAppointmentWindow(slot, NY)).toBe("9:00–9:30 AM");
  });

  it("reads in the business timezone regardless of where it is rendered", () => {
    // 13:00Z is 9:00 AM in New York and 6:30 PM in IST. An owner in India
    // reading a New York calendar must still see the business's own clock.
    const slot: Slot = {
      start: new Date("2026-08-31T13:00:00Z"),
      end: new Date("2026-08-31T13:30:00Z"),
      blockStart: new Date("2026-08-31T13:00:00Z"),
      blockEnd: new Date("2026-08-31T13:30:00Z"),
      dateIso: "2026-08-31",
    };
    expect(describeAppointmentWindow(slot, NY)).toBe("9:00–9:30 AM");
    expect(describeAppointmentWindow(slot, "Asia/Kolkata")).toBe("6:30–7:00 PM");
  });

  it("says the meridiem twice when the window crosses noon", () => {
    const slot: Slot = {
      start: new Date("2026-08-31T15:30:00Z"), // 11:30 AM NY
      end: new Date("2026-08-31T16:30:00Z"), // 12:30 PM NY
      blockStart: new Date("2026-08-31T15:30:00Z"),
      blockEnd: new Date("2026-08-31T16:30:00Z"),
      dateIso: "2026-08-31",
    };
    expect(describeAppointmentWindow(slot, NY)).toBe("11:30 AM–12:30 PM");
  });
});
