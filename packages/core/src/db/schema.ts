import {
  boolean,
  index,
  integer,
  uniqueIndex,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_BOOKING_POLICY,
  type TranscriptEntry,
  type CalendarProvider,
  type CalendarPayload,
  type BusinessHours,
  type PhoneNumberProvider,
} from "@receptionist/shared";
export type {
  Service,
  ServiceDraft,
  AgentProfile,
  TranscriptEntry,
  CalendarProvider,
  CalendarPayload,
  BusinessHours,
  BookingPolicy,
  AgentSetup,
  PhoneNumberProvider,
} from "@receptionist/shared";
export type { CallOutcome } from "@receptionist/shared";

export const callOutcomeEnum = pgEnum("call_outcome", [
  "answered",
  "booked",
  "escalated",
  "abandoned",
  "error",
]);

export const escalationStatusEnum = pgEnum("escalation_status", ["pending", "resolved"]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "requested",
  "confirmed",
  "cancelled",
]);

/** A business's phone presence, and everything shaping how it answers. */
export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** The business. `personaName` is what the receptionist calls itself. */
  businessName: text("business_name").notNull(),
  personaName: text("persona_name").notNull().default(""),
  industry: text("industry").notNull().default(""),
  timezone: text("timezone").notNull(),
  description: text("description").notNull().default(""),
  greeting: text("greeting").notNull().default(""),
  farewell: text("farewell").notNull().default(""),
  fallback: text("fallback").notNull().default(""),
  /** Local wall clock read against `timezone`, so "we open at 9" survives DST. */
  businessHours: jsonb("business_hours")
    .$type<BusinessHours>()
    .notNull()
    .default(DEFAULT_BUSINESS_HOURS),
  minNoticeMinutes: integer("min_notice_minutes")
    .notNull()
    .default(DEFAULT_BOOKING_POLICY.minNoticeMinutes),
  maxAdvanceDays: integer("max_advance_days")
    .notNull()
    .default(DEFAULT_BOOKING_POLICY.maxAdvanceDays),
  /** The owner's preference. What happens is `recordingEnabled()`. */
  recordCalls: boolean("record_calls").notNull().default(true),
  checklistDismissed: boolean("checklist_dismissed").notNull().default(false),
  /** Hours are valid from creation, so this cannot tick itself off from the data. */
  hoursSeen: boolean("hours_seen").notNull().default(false),
  clerkUserId: text("clerk_user_id").unique(),
  /** Generic, so a vendor name never sits in a column. */
  calendarProvider: text("calendar_provider").$type<CalendarProvider>(),
  calendarExternalId: text("calendar_external_id"),
  calendarPayload: jsonb("calendar_payload").$type<CalendarPayload>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Its own table, so a number changes without writing to the agent row. */
export const phoneNumbers = pgTable(
  "phone_numbers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Globally unique: a number reaches exactly one agent. */
    e164: text("e164").notNull().unique(),
    provider: text("provider").$type<PhoneNumberProvider>().notNull().default("livekit"),
    /** The number's id at the provider, for reconfiguring or releasing it. */
    providerSid: text("provider_sid"),
    label: text("label").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("phone_numbers_agent_idx").on(table.agentId)],
);

/** Somebody who phoned. */
export const callers = pgTable(
  "callers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    phoneNumber: text("phone_number").notNull(),
    name: text("name"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("callers_agent_phone_unique").on(table.agentId, table.phoneNumber),
    index("callers_agent_last_seen_idx").on(table.agentId, table.lastSeenAt),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    callerId: uuid("caller_id").references(() => callers.id, { onDelete: "set null" }),
    /** Null for a withheld number. Never a placeholder identity. */
    callerPhone: text("caller_phone"),
    roomName: text("room_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    outcome: callOutcomeEnum("outcome"),
    transcript: jsonb("transcript").$type<TranscriptEntry[]>(),
    summary: text("summary"),
    /** The object key. The URL is presigned per request. */
    recordingKey: text("recording_key"),
    /** Which disclosure wording this caller heard, for a per-call penalty regime. */
    disclosureVersion: text("disclosure_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("calls_agent_started_at_idx").on(table.agentId, table.startedAt)],
);

export const escalations = pgTable(
  "escalations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    callId: uuid("call_id").references(() => calls.id, { onDelete: "set null" }),
    callerId: uuid("caller_id").references(() => callers.id, { onDelete: "set null" }),
    callerPhone: text("caller_phone"),
    /** An anonymous caller has no `callers` row, so the name lives here. */
    callerName: text("caller_name"),
    question: text("question").notNull(),
    transcriptExcerpt: text("transcript_excerpt"),
    status: escalationStatusEnum("status").notNull().default("pending"),
    answer: text("answer"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("escalations_agent_status_created_at_idx").on(
      table.agentId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex("escalations_call_question_dedup_idx")
      .on(table.callId, sql`lower(${table.question})`)
      .where(sql`${table.callId} IS NOT NULL`),
  ],
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    sourceEscalationId: uuid("source_escalation_id").references(() => escalations.id, {
      onDelete: "set null",
    }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_items_agent_created_at_idx").on(table.agentId, table.createdAt),
  ],
);

/** A table, so a booking points at a permanent id that survives a rename. */
export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    price: text("price").notNull().default(""),
    description: text("description").notNull().default(""),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    /** Time the calendar holds either side that the caller never hears about. */
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    /** Plural from day one, empty for everyone today. */
    requiredResources: jsonb("required_resources")
      .$type<string[]>()
      .notNull()
      .default([]),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("services_agent_position_idx").on(table.agentId, table.position)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    callerId: uuid("caller_id").references(() => callers.id, { onDelete: "set null" }),
    callerPhone: text("caller_phone"),
    callerName: text("caller_name"),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    /** The name as it stood at booking, so history survives a rename or a delete. */
    serviceName: text("service_name").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }),
    endTime: timestamp("end_time", { withTimezone: true }),
    /** The padded block the calendar holds. What `appointments_no_overlap` guards. */
    blockStart: timestamp("block_start", { withTimezone: true }),
    blockEnd: timestamp("block_end", { withTimezone: true }),
    status: appointmentStatusEnum("status").notNull(),
    /** The event's id in whichever provider `agents.calendar_provider` names. */
    externalEventId: text("external_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("appointments_agent_start_time_idx").on(table.agentId, table.startTime),
  ],
);
