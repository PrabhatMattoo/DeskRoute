import { afterAll, describe, expect, it } from "vitest";
import { and, eq, isNotNull } from "drizzle-orm";
import type { BookingPolicy, BusinessHours } from "@receptionist/shared";
import { closeDb, db } from "../src/db/client.js";
import { agents } from "../src/db/schema.js";
import { getGoogleOAuthToken } from "../src/providers/googleAuth.js";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchBusyRanges,
  listCalendars,
} from "../src/providers/calendar.js";
import {
  addDays,
  describeSlot,
  filterByBusy,
  generateCandidateSlots,
  localDateIso,
  type Slot,
} from "../src/domain/scheduling.js";

/** The one property only a real calendar confirms: an event spans the padded
 *  block, so freeBusy does not report the setup and cleanup free. */

/** Buffers on BOTH sides, so padding is exercised whatever the agent configured. */
const PROBE_SERVICE = {
  durationMinutes: 30,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 15,
} as const;

/** Start far enough out that a real booking today is not disturbed. */
const SEARCH_FROM_DAYS = 2;
const SEARCH_DAYS = 7;

/** Widen the freeBusy window past the block, or Google clips the busy range to
 *  the query window and the coverage assertion becomes trivially true. */
const WINDOW_PAD_MS = 60 * 60 * 1000;

const EVENT_SUMMARY = "DeskRoute automated test — safe to delete";

type LiveContext = {
  agentId: string;
  businessName: string;
  calendarId: string;
  token: string;
  timeZone: string;
  hours: BusinessHours;
  policy: BookingPolicy;
};

/**
 * Resolved at module load rather than in `beforeAll`, because `describe.skipIf`
 * is evaluated at collection time and cannot see a hook's result.
 */
async function resolveContext(): Promise<{ ctx: LiveContext | null; reason?: string }> {
  const override = process.env.LIVE_AGENT_ID;

  const rows = await db
    .select({
      id: agents.id,
      businessName: agents.businessName,
      timezone: agents.timezone,
      businessHours: agents.businessHours,
      minNoticeMinutes: agents.minNoticeMinutes,
      maxAdvanceDays: agents.maxAdvanceDays,
      clerkUserId: agents.clerkUserId,
      calendarExternalId: agents.calendarExternalId,
    })
    .from(agents)
    .where(
      override
        ? eq(agents.id, override)
        : and(isNotNull(agents.calendarExternalId), isNotNull(agents.clerkUserId)),
    )
    .limit(1);

  const agent = rows[0];
  if (!agent) {
    return {
      ctx: null,
      reason: override
        ? `no agent with id ${override}`
        : "no agent has a connected calendar — connect one in Settings → Business first",
    };
  }
  if (!agent.calendarExternalId || !agent.clerkUserId) {
    return { ctx: null, reason: `agent ${agent.id} has no connected calendar` };
  }

  const token = await getGoogleOAuthToken(agent.clerkUserId);
  if (!token) {
    return {
      ctx: null,
      reason: `no Google token for agent ${agent.id} — reconnect the calendar`,
    };
  }

  return {
    ctx: {
      agentId: agent.id,
      businessName: agent.businessName,
      calendarId: agent.calendarExternalId,
      token,
      timeZone: agent.timezone,
      hours: agent.businessHours,
      policy: {
        minNoticeMinutes: agent.minNoticeMinutes,
        maxAdvanceDays: agent.maxAdvanceDays,
      },
    },
  };
}

const { ctx, reason } = await resolveContext();

if (!ctx) {
  console.warn(`\n[live] SKIPPING calendar tests: ${reason}\n`);
}

/** Tracked outside the test so `afterAll` can clean up after a mid-test failure. */
let strandedEventId: string | null = null;

afterAll(async () => {
  if (ctx && strandedEventId) {
    await deleteCalendarEvent(ctx.token, ctx.calendarId, strandedEventId).catch(
      (err: unknown) =>
        console.error(
          `[live] could not clean up event ${strandedEventId} — delete it by hand:`,
          err,
        ),
    );
  }
  // The pool holds live sockets on purpose (keepAlive, 30s idle), and those are
  // libuv handles, so vitest never exits without this.
  await closeDb();
});

describe.skipIf(ctx === null)("Google Calendar, for real", () => {
  const live = ctx as LiveContext;

  it("still lists the calendar the agent chose, as writable", async () => {
    // Filtered to writers, so a calendar deleted or un-shared after being chosen
    // fails here rather than at the first booking.
    const calendars = await listCalendars(live.token);

    expect(calendars.map((c) => c.id)).toContain(live.calendarId);
  });

  it("reserves the padded block, so buffers are not offered to the next caller", async () => {
    const now = new Date();
    const fromDate = addDays(localDateIso(now, live.timeZone), SEARCH_FROM_DAYS);

    const candidates = generateCandidateSlots({
      hours: live.hours,
      policy: live.policy,
      service: PROBE_SERVICE,
      timeZone: live.timeZone,
      now,
      fromDate,
      days: SEARCH_DAYS,
    });

    expect(
      candidates.length,
      `no candidate slots in ${SEARCH_DAYS} days from ${fromDate} — check the ` +
        `agent's opening hours, every weekday may be closed`,
    ).toBeGreaterThan(0);

    const searchBusy = await fetchBusyRanges(
      live.token,
      live.calendarId,
      candidates[0]!.blockStart.toISOString(),
      candidates.at(-1)!.blockEnd.toISOString(),
    );

    const free = filterByBusy(candidates, searchBusy);
    expect(free.length, "every candidate slot is already busy").toBeGreaterThan(0);

    const slot: Slot = free[0]!;

    // Widened, so the returned range reflects the event's real extent rather
    // than being clipped to the query window.
    const windowMin = new Date(slot.blockStart.getTime() - WINDOW_PAD_MS).toISOString();
    const windowMax = new Date(slot.blockEnd.getTime() + WINDOW_PAD_MS).toISOString();

    const eventId = await createCalendarEvent(live.token, live.calendarId, {
      summary: EVENT_SUMMARY,
      startIso: slot.blockStart.toISOString(),
      endIso: slot.blockEnd.toISOString(),
      timezone: live.timeZone,
      description: "Written by calendar.live.test.ts. Deleted automatically.",
    });
    strandedEventId = eventId;

    try {
      const busyAfter = await fetchBusyRanges(
        live.token,
        live.calendarId,
        windowMin,
        windowMax,
      );

      // An event written over start-end rather than the block reports a busy
      // range 10 minutes late and 15 minutes short, and fails here.
      const covers = busyAfter.some(
        (b) =>
          b.start.getTime() <= slot.blockStart.getTime() &&
          b.end.getTime() >= slot.blockEnd.getTime(),
      );
      expect(
        covers,
        `no busy range covers the padded block ` +
          `${slot.blockStart.toISOString()}–${slot.blockEnd.toISOString()}; ` +
          `Google returned ${JSON.stringify(
            busyAfter.map((b) => [b.start.toISOString(), b.end.toISOString()]),
          )}`,
      ).toBe(true);

      // And the slot the agent would have offered is now correctly withheld.
      expect(filterByBusy([slot], busyAfter)).toHaveLength(0);
    } finally {
      await deleteCalendarEvent(live.token, live.calendarId, eventId);
      strandedEventId = null;
    }

    // Deleting frees it again — proves cancellation actually releases the time.
    const busyFinal = await fetchBusyRanges(
      live.token,
      live.calendarId,
      slot.blockStart.toISOString(),
      slot.blockEnd.toISOString(),
    );
    expect(filterByBusy([slot], busyFinal)).toHaveLength(1);

    console.log(
      `[live] verified padded block for "${live.businessName}" at ` +
        `${describeSlot(slot, live.timeZone)} (${live.timeZone})`,
    );
  });
});
