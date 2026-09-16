import type { CalendarOption } from "@receptionist/shared";

const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export type BusyRange = { start: Date; end: Date };

/** Raised when the token is valid but was minted without the calendar scope. */
export class CalendarScopeMissingError extends Error {
  constructor() {
    super("[calendar] the Google token carries no calendar scope");
    this.name = "CalendarScopeMissingError";
  }
}

/**
 * Filtered to calendars the account can create events on, so a read-only
 * subscription cannot be chosen and then fail at the first booking.
 */
export async function listCalendars(accessToken: string): Promise<CalendarOption[]> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/users/me/calendarList?minAccessRole=writer`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  // A sign-in token carries no calendar scope, which is the normal state of a
  // disconnected account rather than a failure.
  if (res.status === 401 || res.status === 403) {
    throw new CalendarScopeMissingError();
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[calendar] calendarList failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      timeZone?: string;
      primary?: boolean;
    }>;
  };

  return (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? item.id,
    timeZone: item.timeZone,
    primary: item.primary === true,
  }));
}

/** Only a fetch. Google says what is taken; `domain/scheduling.ts` says what exists. */
export async function fetchBusyRanges(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyRange[]> {
  const res = await fetch(`${GOOGLE_CALENDAR_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[calendar] freeBusy failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    calendars: Record<string, { busy: { start: string; end: string }[] }>;
  };

  return (data.calendars[calendarId]?.busy ?? []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string;
    /** The padded block: freeBusy would report bare setup and cleanup as free. */
    startIso: string;
    endIso: string;
    timezone: string;
    description?: string;
  },
): Promise<string> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description ?? "Booked via AI Receptionist",
        start: { dateTime: event.startIso, timeZone: event.timezone },
        end: { dateTime: event.endIso, timeZone: event.timezone },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[calendar] createEvent failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok && res.status !== 410) {
    const body = await res.text();
    throw new Error(`[calendar] deleteEvent failed: ${res.status} ${body}`);
  }
}
