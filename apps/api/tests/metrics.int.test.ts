import { describe, it, expect } from "vitest";
import { countAfterHoursCalls } from "@receptionist/core/repositories/metrics.js";
import { makeAgent, makeCall } from "@receptionist/core/tests/factories.js";

const NY = "America/New_York";

/** Mon-Fri 09:00-17:00, weekends shut. */
const NINE_TO_FIVE = {
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
};

const SINCE = new Date("2026-08-01T00:00:00Z");

/** Counted against the agent's own hours in its own zone, which a
 *  `WHERE extract(hour ...)` on the raw timestamp cannot do. */
describe("countAfterHoursCalls", () => {
  it("does not count a call inside opening hours", async () => {
    const t = await makeAgent({ timezone: NY, businessHours: NINE_TO_FIVE });
    // Wednesday 19 August 2026, 14:00 UTC — 10:00 in New York.
    await makeCall(t.id, { startedAt: new Date("2026-08-19T14:00:00Z") });

    expect(await countAfterHoursCalls(t.id, SINCE, NINE_TO_FIVE, NY)).toBe(0);
  });

  it("counts a call that is inside hours in UTC and outside them locally", async () => {
    // 13:00 UTC is 09:00 in New York — but 08:00 in Chicago, an hour before it
    // opens. Comparing the raw timestamp would call this one open.
    const t = await makeAgent({
      timezone: "America/Chicago",
      businessHours: NINE_TO_FIVE,
    });
    await makeCall(t.id, { startedAt: new Date("2026-08-19T13:00:00Z") });

    expect(await countAfterHoursCalls(t.id, SINCE, NINE_TO_FIVE, "America/Chicago")).toBe(
      1,
    );
  });

  it("counts every call on a day with no hours at all", async () => {
    const t = await makeAgent({ timezone: NY, businessHours: NINE_TO_FIVE });
    // Saturday 22 August 2026, midday in New York.
    await makeCall(t.id, { startedAt: new Date("2026-08-22T16:00:00Z") });

    expect(await countAfterHoursCalls(t.id, SINCE, NINE_TO_FIVE, NY)).toBe(1);
  });

  it("lets a date exception close an ordinarily open day", async () => {
    // Hours are a weekly pattern that an exception replaces outright, so a
    // holiday has to make an otherwise ordinary Wednesday count.
    const hours = {
      ...NINE_TO_FIVE,
      exceptions: [{ date: "2026-08-19", intervals: [], label: "Closed" }],
    };
    const t = await makeAgent({ timezone: NY, businessHours: hours });
    await makeCall(t.id, { startedAt: new Date("2026-08-19T14:00:00Z") });

    expect(await countAfterHoursCalls(t.id, SINCE, hours, NY)).toBe(1);
  });

  it("treats closing time as shut, and the minute before it as open", async () => {
    const t = await makeAgent({ timezone: NY, businessHours: NINE_TO_FIVE });
    // 16:59 and 17:00 in New York on the same Wednesday.
    await makeCall(t.id, { startedAt: new Date("2026-08-19T20:59:00Z") });
    await makeCall(t.id, { startedAt: new Date("2026-08-19T21:00:00Z") });

    expect(await countAfterHoursCalls(t.id, SINCE, NINE_TO_FIVE, NY)).toBe(1);
  });

  it("ignores calls from before the window", async () => {
    const t = await makeAgent({ timezone: NY, businessHours: NINE_TO_FIVE });
    // A Sunday well before `SINCE` — out of hours, but out of the period too.
    await makeCall(t.id, { startedAt: new Date("2026-07-19T16:00:00Z") });

    expect(await countAfterHoursCalls(t.id, SINCE, NINE_TO_FIVE, NY)).toBe(0);
  });
});
