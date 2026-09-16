import { z } from "zod";

/**
 * Checked against what this Node build knows: `buildSystemPrompt` formats every
 * date with it, and an unknown zone throws inside `session.start()`.
 */
const ianaTimezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Unknown timezone. Use an IANA name such as America/New_York." },
);

export const serviceDraftSchema = z.object({
  name: z.string().min(1, "A service needs a name"),
  price: z.string().default(""),
  description: z.string().optional(),
  // Upper bound is a sanity rail, not a product limit: a full day is 1440
  // minutes, and anything longer is a typo rather than an appointment.
  durationMinutes: z.number().int().min(5).max(1440).default(60),
  bufferBeforeMinutes: z.number().int().min(0).max(480).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(480).default(0),
  requiredResources: z.array(z.string()).default([]),
});

export const serviceUpdateSchema = serviceDraftSchema.partial();

/** 24-hour local wall clock. */
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const timeString = z.string().regex(TIME_RE, "Use a 24-hour time such as 09:00");

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

/** `end` after `start`, so no period crosses midnight and no slot is ambiguous
 *  about which day it belongs to. */
const timeIntervalSchema = z
  .object({ start: timeString, end: timeString })
  .refine((i) => toMinutes(i.end) > toMinutes(i.start), {
    message: "Closing time must be after opening time",
  });

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

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const businessHoursSchema = z.object({
  weekly: z.object(
    Object.fromEntries(WEEKDAY_KEYS.map((d) => [d, dayIntervalsSchema])) as Record<
      (typeof WEEKDAY_KEYS)[number],
      typeof dayIntervalsSchema
    >,
  ),
  exceptions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-25"),
        intervals: dayIntervalsSchema,
        label: z.string().optional(),
      }),
    )
    .default([]),
});

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

const agentProfileSchema = z.object({
  name: z.string(),
  greeting: z.string(),
  farewell: z.string(),
  fallback: z.string(),
});

export const updateSettingsSchema = z.object({
  business: z
    .object({
      name: z.string().optional(),
      industry: z.string().optional(),
      timezone: ianaTimezone.optional(),
      description: z.string().optional(),
      businessHours: businessHoursSchema.optional(),
      bookingPolicy: bookingPolicySchema.optional(),
      recordCalls: z.boolean().optional(),
    })
    .optional(),
  /* The two things the Home checklist has to remember. Separate from `business`
     because it is about the owner's progress, not the business itself. */
  setup: z
    .object({
      checklistDismissed: z.boolean().optional(),
      hoursSeen: z.boolean().optional(),
    })
    .optional(),
  agent: agentProfileSchema.partial().optional(),
});

/** What it takes to answer a phone. Services and description belong to the
 *  setup checklist, and are accepted here for an import that sends them. */
export const onboardingCreateSchema = z.object({
  name: z.string().min(1),
  industry: z.string(),
  description: z.string().default(""),
  services: z.array(serviceDraftSchema).default([]),
  timezone: ianaTimezone.default("UTC"),
  agentProfile: agentProfileSchema.optional(),
  phoneNumber: z.string().min(1),
});

export const escalationResolveSchema = z.object({
  answer: z.string().min(1, "answer is required"),
});

export const phoneProvisionSchema = z.object({
  phoneNumber: z.string().min(1, "phoneNumber is required"),
});

export const calendarSelectSchema = z.object({
  calendarId: z.string().min(1, "calendarId is required"),
  summary: z.string().min(1),
  timeZone: z.string().optional(),
});
