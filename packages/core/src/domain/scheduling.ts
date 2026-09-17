import type {
  BookingPolicy,
  BusinessHours,
  Service,
  TimeInterval,
  Weekday,
} from "@receptionist/shared";

/**
 * Which times exist, from the opening hours, the service length and the booking
 * policy. No database, no network, and the clock only through an explicit `now`.
 */

/** Slot starts land on this grid. Fifteen minutes reads naturally out loud. */
const GRID_MINUTES = 15;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const WEEKDAY_BY_INDEX: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export type Slot = {
  /** When the caller's appointment starts. */
  start: Date;
  /** When it ends. Excludes padding. */
  end: Date;
  /** Padding included — what the calendar must actually hold. */
  blockStart: Date;
  blockEnd: Date;
  /** Local calendar date, "YYYY-MM-DD". */
  dateIso: string;
};

export type BusyRange = { start: Date; end: Date };

export type PartOfDay = "morning" | "afternoon" | "evening";

/** Always an explicit `timeZone`: the worker runs in UTC and the business does not. */
function zonedParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some ICU builds render midnight as hour 24 rather than 00.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** How far the zone is from UTC at a given instant, in milliseconds. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/**
 * "2026-08-19" + "09:00" in a zone to the matching UTC instant. Two passes,
 * because the offset depends on the instant still being solved for.
 */
export function zonedWallClockToUtc(
  dateIso: string,
  hhmm: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);

  const naive = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const firstPass = naive - offsetMsAt(new Date(naive), timeZone);
  const corrected = naive - offsetMsAt(new Date(firstPass), timeZone);

  return new Date(corrected);
}

/** The local calendar date of an instant, "YYYY-MM-DD". */
export function localDateIso(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Pure calendar arithmetic on a date string — no timezone involved. */
export function addDays(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day!) + days * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

export function weekdayOf(dateIso: string): Weekday {
  const [year, month, day] = dateIso.split("-").map(Number);
  return WEEKDAY_BY_INDEX[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]!;
}

/** An exception replaces the weekly pattern outright, which is what makes a
 *  closed day expressible. */
export function intervalsForDate(hours: BusinessHours, dateIso: string): TimeInterval[] {
  const exception = hours.exceptions.find((e) => e.date === dateIso);
  if (exception) return exception.intervals;
  return hours.weekly[weekdayOf(dateIso)] ?? [];
}

export function isOpenOn(hours: BusinessHours, dateIso: string): boolean {
  return intervalsForDate(hours, dateIso).length > 0;
}

const PART_OF_DAY_RANGES: Record<PartOfDay, [number, number]> = {
  morning: [0, 12],
  afternoon: [12, 17],
  evening: [17, 24],
};

export type GenerateSlotsInput = {
  hours: BusinessHours;
  policy: BookingPolicy;
  service: Pick<
    Service,
    "durationMinutes" | "bufferBeforeMinutes" | "bufferAfterMinutes"
  >;
  timeZone: string;
  now: Date;
  /** Local date to start searching from. Defaults to today. */
  fromDate?: string;
  /** How many days to walk. Clamped by the policy's maximum. */
  days?: number;
  partOfDay?: PartOfDay | null;
};

/**
 * The grid walks appointment starts, so quoted times land on the quarter hour.
 * Extra time is dropped rather than moved at the edges of an opening period.
 */
export function generateCandidateSlots({
  hours,
  policy,
  service,
  timeZone,
  now,
  fromDate,
  days,
  partOfDay,
}: GenerateSlotsInput): Slot[] {
  const durationMs = service.durationMinutes * MINUTE_MS;
  if (durationMs <= 0) return [];

  const today = localDateIso(now, timeZone);
  const start = fromDate && fromDate > today ? fromDate : today;

  // Never search past the booking window, however many days were asked for.
  const lastAllowed = addDays(today, policy.maxAdvanceDays);
  const window = days ?? policy.maxAdvanceDays;

  const earliest = new Date(now.getTime() + policy.minNoticeMinutes * MINUTE_MS);
  const slots: Slot[] = [];

  for (let offset = 0; offset <= window; offset++) {
    const dateIso = addDays(start, offset);
    if (dateIso > lastAllowed) break;

    for (const interval of intervalsForDate(hours, dateIso)) {
      const opens = zonedWallClockToUtc(dateIso, interval.start, timeZone);
      const closes = zonedWallClockToUtc(dateIso, interval.end, timeZone);

      for (
        let startMs = opens.getTime();
        startMs + durationMs <= closes.getTime();
        startMs += GRID_MINUTES * MINUTE_MS
      ) {
        const appointmentStart = new Date(startMs);
        const endMs = startMs + durationMs;

        // Too soon: not because the calendar is busy, but because a person needs
        // warning. See BookingPolicy.
        if (appointmentStart < earliest) continue;

        if (partOfDay) {
          const [from, to] = PART_OF_DAY_RANGES[partOfDay];
          const hour = zonedParts(appointmentStart, timeZone).hour;
          if (hour < from || hour >= to) continue;
        }

        // Clamped to the interval, which is what drops the padding at an edge
        // rather than spilling it outside the hours the business keeps.
        const blockStart = Math.max(
          opens.getTime(),
          startMs - service.bufferBeforeMinutes * MINUTE_MS,
        );
        const blockEnd = Math.min(
          closes.getTime(),
          endMs + service.bufferAfterMinutes * MINUTE_MS,
        );

        slots.push({
          start: appointmentStart,
          end: new Date(endMs),
          blockStart: new Date(blockStart),
          blockEnd: new Date(blockEnd),
          dateIso,
        });
      }
    }
  }

  return slots;
}

/** Compares the padded block, not the appointment: cleanup is a real conflict. */
export function filterByBusy(slots: Slot[], busy: BusyRange[]): Slot[] {
  if (busy.length === 0) return slots;

  return slots.filter((slot) =>
    busy.every(
      (b) =>
        slot.blockStart.getTime() >= b.end.getTime() ||
        slot.blockEnd.getTime() <= b.start.getTime(),
    ),
  );
}

/** "Wed Aug 19, 2:00 PM" — how the agent says it out loud. */
export function describeSlot(slot: Slot, timeZone: string): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(slot.start)
      // Drops the comma after the weekday only. The one before the time stays —
      // it is where a person pauses when reading the slot aloud.
      .replace(",", "")
  );
}

/**
 * The appointment's own window in the business's timezone. The event spans the
 * padded block and Google renders it in the viewer's zone, so the title says both.
 */
export function describeAppointmentWindow(slot: Slot, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // The meridiem is said once, at the end, unless the window crosses noon.
  const start = fmt.format(slot.start);
  const end = fmt.format(slot.end);
  const [startClock, startMeridiem] = start.split(" ");
  const [, endMeridiem] = end.split(" ");
  return startMeridiem === endMeridiem ? `${startClock}–${end}` : `${start}–${end}`;
}

/** "Sunday 23 August" — for telling a caller which day is closed. */
export function describeDate(dateIso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(zonedWallClockToUtc(dateIso, "12:00", timeZone));
}

/** `checkAvailability` offers the catalogue by name, and `services_agent_name_idx`
 *  keeps one name on one row, so this reads a name back to its service. */
export function serviceByName(services: Service[], name: string): Service | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return services.find((s) => s.name.trim().toLowerCase() === wanted) ?? null;
}
