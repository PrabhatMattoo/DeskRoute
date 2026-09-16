import type { BusinessHours } from "@receptionist/shared";
import { intervalsForDate, localDateIso, zonedWallClockToUtc } from "./scheduling.js";

export function periodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

/** A day with no intervals is shut all day, which covers weekends and holidays. */
export function isAfterHours(
  started: Date,
  hours: BusinessHours,
  timeZone: string,
): boolean {
  const dateIso = localDateIso(started, timeZone);
  const intervals = intervalsForDate(hours, dateIso);
  if (intervals.length === 0) return true;

  return !intervals.some((i) => {
    const opens = zonedWallClockToUtc(dateIso, i.start, timeZone);
    const closes = zonedWallClockToUtc(dateIso, i.end, timeZone);
    return started >= opens && started < closes;
  });
}
