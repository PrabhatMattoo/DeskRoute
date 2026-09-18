import { z } from "zod";
import {
  agentProfileSchema,
  agentSetupSchema,
  bookingPolicySchema,
  businessHoursSchema,
  serviceDraftSchema,
} from "@receptionist/shared";

/**
 * Request bodies. The shapes they carry are declared once in
 * `@receptionist/shared`, where every package reads the same schema.
 */

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

export const serviceUpdateSchema = serviceDraftSchema.partial();

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
  setup: agentSetupSchema.partial().optional(),
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

/* Query schemas. Each falls back to its default rather than rejecting, since the
   repositories these feed already treat an unknown value as the default. */

export const metricsQuerySchema = z.object({
  period: z.enum(["today", "7d", "30d"]).catch("30d").default("30d"),
});

export const callsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).catch(50).default(50),
  offset: z.coerce.number().int().min(0).catch(0).default(0),
});

export const escalationsQuerySchema = z.object({
  status: z.enum(["pending", "resolved"]).catch("pending").default("pending"),
});

export const areaCodeQuerySchema = z.object({
  areaCode: z.string().optional(),
});
