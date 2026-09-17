import { z } from "zod";

/**
 * One declaration per shape. The API validates with the schema, every package
 * reads the type `z.infer` derives from it, and the defaults come out of it too.
 */

export const serviceDraftSchema = z.object({
  name: z.string().trim().min(1, "A service needs a name"),
  price: z.string().default(""),
  description: z.string().optional(),
  // Upper bound is a sanity rail, not a product limit: a full day is 1440
  // minutes, and anything longer is a typo rather than an appointment.
  durationMinutes: z.number().int().min(5).max(1440).default(60),
  bufferBeforeMinutes: z.number().int().min(0).max(480).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(480).default(0),
  requiredResources: z.array(z.string()).default([]),
});

export const serviceSchema = serviceDraftSchema.extend({ id: z.string().uuid() });

/** The buffers widen the calendar block, not the appointment the caller hears. */
export type Service = z.infer<typeof serviceSchema>;

/** A service before it exists: what the create form and onboarding send. */
export type ServiceDraft = z.infer<typeof serviceDraftSchema>;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** 24-hour local wall clock. */
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const timeString = z.string().regex(TIME_RE, "Use a 24-hour time such as 09:00");

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

/** `end` after `start`, so no period crosses midnight and no slot is ambiguous
 *  about which day it belongs to. */
export const timeIntervalSchema = z
  .object({ start: timeString, end: timeString })
  .refine((i) => toMinutes(i.end) > toMinutes(i.start), {
    message: "Closing time must be after opening time",
  });

/** Local wall clock "HH:MM", never UTC, so "we open at 9" survives daylight saving. */
export type TimeInterval = z.infer<typeof timeIntervalSchema>;

/** Overlaps are rejected rather than merged, because merging hides the mistake. */
const dayIntervalsSchema = z.array(timeIntervalSchema).superRefine((intervals, ctx) => {
  const sorted = [...intervals].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i]!.start) < toMinutes(sorted[i - 1]!.end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Opening periods on the same day cannot overlap",
      });
      return;
    }
  }
});

export const hoursExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-25"),
  intervals: dayIntervalsSchema,
  label: z.string().optional(),
});

/** Replaces the weekly pattern for one date. Empty `intervals` means shut all day. */
export type HoursException = z.infer<typeof hoursExceptionSchema>;

export const businessHoursSchema = z.object({
  weekly: z.object(
    Object.fromEntries(WEEKDAYS.map((d) => [d, dayIntervalsSchema])) as Record<
      Weekday,
      typeof dayIntervalsSchema
    >,
  ),
  exceptions: z.array(hoursExceptionSchema).default([]),
});

/** Several intervals per day, because a lunch closure is two and not one. */
export type BusinessHours = z.infer<typeof businessHoursSchema>;

export const bookingPolicySchema = z.object({
  // 0 is legitimate — a barbershop happily takes someone walking in now.
  minNoticeMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 7)
    .default(30),
  maxAdvanceDays: z.number().int().min(1).max(365).default(60),
});

/** `minNoticeMinutes` covers the person, not the calendar; padding covers the calendar. */
export type BookingPolicy = z.infer<typeof bookingPolicySchema>;

/** The schema's own defaults, so the two cannot disagree. */
export const DEFAULT_BOOKING_POLICY: BookingPolicy = bookingPolicySchema.parse({});

/** Mon–Fri, 9 to 5. A starting point every business will edit. */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
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

export const agentProfileSchema = z.object({
  name: z.string(),
  greeting: z.string(),
  farewell: z.string(),
  fallback: z.string(),
});

/** The phrases an owner controls. There is no hold phrase: speech is a queue. */
export type AgentProfile = z.infer<typeof agentProfileSchema>;

export const agentSetupSchema = z.object({
  checklistDismissed: z.boolean().default(false),
  hoursSeen: z.boolean().default(false),
});

/** Only what cannot be derived: hours are valid from creation, so nothing else says
 *  whether they have been looked at. */
export type AgentSetup = z.infer<typeof agentSetupSchema>;

export const DEFAULT_AGENT_SETUP: AgentSetup = agentSetupSchema.parse({});

export const availableNumberSchema = z.object({
  id: z.string(),
  e164_format: z.string(),
  locality: z.string(),
  region: z.string(),
});

/** One number the carrier has free, as its search returns it. */
export type AvailableNumber = z.infer<typeof availableNumberSchema>;
