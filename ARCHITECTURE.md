# Architecture

Reference for the whole system. `CLAUDE.md` holds the rules an agent must follow and points here for everything descriptive; nothing is stated in both.

## Contents

- [The domain](#the-domain)
- [Repository layout](#repository-layout)
- [Processes](#processes)
- [Environment](#environment)
- [Database](#database)
- [The call path](#the-call-path)
- [The receptionist](#the-receptionist)
- [Booking](#booking)
- [Telephony](#telephony)
- [Auth](#auth)
- [Dashboard](#dashboard)
- [Tests](#tests)
- [Local tooling](#local-tooling)
- [Decisions, and the measurements behind them](#decisions-and-the-measurements-behind-them)

---

## The domain

An **agent** is a business's phone presence: its hours, services, calendar, persona, knowledge base, and one or more phone numbers. One deployment holds one or more. Two shops is two agents, and so is one shop running a sales line beside a support line.

A **caller** is somebody who phoned. A **call** is one conversation, with its transcript, summary, outcome and recording key. An **escalation** is a question the agent could not answer, queued for the owner; answering it writes a **knowledge item** the agent reads on every later call.

Every table carries `agent_id`, and every repository function takes `agentId` first. The LLM never receives or chooses an agent id.

## Repository layout

```
apps/api         Hono server, one module per resource under src/modules
apps/voice       LiveKit worker
apps/web         Admin dashboard
packages/core    db, repositories, providers, domain, env
packages/shared  Domain types and constants, also consumed by the browser
tests/           The three vitest setup files
```

`packages/core` splits by what a thing talks to. `db/` holds the schema and the connection. `repositories/` wrap Drizzle and are the only code that reads or writes Postgres. `providers/` reach outward to Google Calendar, LiveKit and R2. `domain/` is pure logic with no I/O, so it is testable without booting anything.

`apps/voice/src` splits by lifetime. `receptionist/` is what LiveKit dispatches under the name `receptionist`: the `Agent` subclass, its instructions, its tools, the turn rule and the greeting. `session/` is one `AgentSession`: which agent answers, how the speech pipeline is wired, who is calling, and what the call leaves behind.

Cross-package imports use the package name with a `.js` specifier, for example `@receptionist/core/repositories/calls.js`. `@receptionist/core` publishes `./*.js` mapping to `./src/*.ts` and `./tests/*.js` mapping to `./tests/*.ts`. There is no build step: TypeScript source is consumed directly through the `exports` field.

Unit tests sit beside their subject. Integration, live and whole-system contract tests get a `tests/` folder, because they span modules or read files off disk and have no single subject to sit beside.

## Processes

Two run in production, plus the static dashboard.

**`apps/api`** is a Hono server on `PORT`. `routes.ts` mounts one chained `Hono` instance per resource with `app.route()`, and exports `AppRoutes` for the RPC client. Handlers live on their routes because Hono infers path parameters only where the two sit together, and `hc<AppRoutes>()` reads chained definitions. Errors bubble to a single `onError` in `app.ts`; the one exception is phone-number provisioning, which releases the purchased number and re-throws.

**`apps/voice`** is a long-running LiveKit worker handling every concurrent call. It connects out to LiveKit and is never connected to.

## Environment

Each package declares what it reads, and every schema reads `process.env` and nothing else. `packages/core` owns `DATABASE_URL`, `LIVEKIT_*`, `CLERK_SECRET_KEY` and `R2_*`. `apps/api` adds `PORT`, `DASHBOARD_ORIGINS` and `CLERK_PUBLISHABLE_KEY`. `apps/voice` adds `LLM_*` and `OPENROUTER_*`.

`parseEnv` in `packages/core/src/env.ts` drops blank values before parsing, so `FOO=` falls through to `.optional()` and `.default()` rather than failing. It throws rather than exiting, because a module-level exit kills anything importing it transitively, the test runner included.

`.env` files are a development convenience, loaded by each app's dev script with `--env-file-if-exists` from its own directory. Nothing in production reads a file: Docker Compose injects `env_file:` into the container and the process reads `process.env`. Each package ships an `.env.example` beside it.

`R2_*` is all four or none. A partial set reads as configured and fails per call.

## Database

Postgres 17, Drizzle, migrations in `packages/core/drizzle`. `docker-compose.yml` runs a persistent database on `DESKROUTE_DB_PORT`, default 5432, and a tmpfs one for tests on a port Docker picks.

**`agents`** is the configuration row. `business_name` is the shop and `persona_name` is what the receptionist calls itself; those were one field and disagreed. `greeting`, `farewell`, `fallback`, `min_notice_minutes`, `max_advance_days`, `checklist_dismissed` and `hours_seen` are flat columns. `business_hours` stays `jsonb` because it is read whole, never queried into, and carries a weekly pattern of multiple intervals per day plus date exceptions that replace the pattern outright. Its times are local wall clock read against `timezone`, never UTC, so "we open at 9" survives daylight saving.

**`phone_numbers`** is its own table so a number is added and an old one removed without writing to the agent row. `e164` is globally unique: a number reaches exactly one agent.

**`callers`** is unique on `(agent_id, phone_number)`. `phone_number` is `NOT NULL`, so a withheld caller ID stores no row at all.

**`calls`** carries `caller_phone` nullable, `room_name`, `transcript` as `jsonb`, `summary`, `recording_key` and `disclosure_version`. `recording_key` is an object key; the URL is presigned per request.

**`escalations`** carries its own `caller_name`, because an anonymous caller has no `callers` row to hang one on. Its dedup index is unique on `(call_id, lower(question))` where `call_id IS NOT NULL`. Status values are lowercase `pending` and `resolved`.

**`services`** is a table rather than a blob, so a booking points at a permanent id that survives a rename. `required_resources` is `string[]`, plural from day one and empty for everyone.

**`appointments`** holds `service_id` with `ON DELETE SET NULL` beside `service_name`, the name as it stood at booking, and its own `caller_name`. `external_event_id` names the event in whichever provider `agents.calendar_provider` names. `block_start` and `block_end` are the padded block, carried so `appointments_no_overlap` can reserve it; they are null on a request that holds no time.

`appointments_no_overlap` is an exclusion constraint, which Drizzle cannot express, so it lives by hand in `0001_booking_overlap_guard.sql`. Drizzle owns `0000_init` and regenerates it freely; hand-written SQL sits in numbered files after it and stays as written.

`caller_phone` is nullable on `calls`, `escalations` and `appointments`.

## The call path

`worker.ts` runs one job per call.

```
ctx.connect() -> waitForParticipant() -> resolveAgent(trunkPhone, or agentId for a test session)
  -> buildSessionConfig() -> session.start() -> session.say(greeting)
  -> [background] startCallRecording, upsertCaller, createCall
```

`ctx.connect()` comes first because `sip.trunkPhoneNumber`, the dialled number used to find the agent, is only available after `waitForParticipant()`.

SIP attributes: `sip.phoneNumber` is who is calling, `sip.trunkPhoneNumber` is the number they dialled.

Database writes and recording are deferred until after the greeting plays, so the caller hears audio without waiting on a round trip. That leaves a window where the agent is live and the `calls` row does not exist, so anything writing a foreign key to it awaits `callRowReady` rather than moving the insert onto the path to first audio.

Agent resolution is cached in `session/resolve-agent.ts` with a five-minute TTL and a 500-entry LRU. The agent, its services and its knowledge expire together, since all three go into one prompt.

**Browser test sessions** carry `testSession: "true"` and `agentId` in participant attributes. The worker resolves by id and skips recording, the `calls` row and the `callers` row. It does not skip booking: `checkAvailability` and `bookAppointment` write a real appointment and a real calendar event. Test rooms use explicit agent dispatch through the join token's `RoomConfiguration`, not the SIP dispatch rule.

## The receptionist

`receptionist/agent.ts` exports `ReceptionistAgent extends voice.Agent`, composing the instructions, the tools and the turn rule. It lives in its own module with no side effects, because `worker.ts` calls `cli.runApp()` at the top level and `withMockTools` keys on the constructor.

**The prompt states facts; the tools state procedure.** `buildSystemPrompt` says who the agent is, what the business sells, when it opens and what it knows, and never names a tool, which `prompt.test.ts` asserts. How and when to use a tool lives on that tool's description and its parameters, where the model reads it at the moment it matters.

Everything above the Caller heading is identical across calls and forms a cacheable prefix; everything below it changes per call.

The knowledge base is inlined into the prompt at call start, capped at 300 items by `KNOWLEDGE_PROMPT_LIMIT`. There is no retrieval tool.

`bookAppointment` and `createEscalation` both take `callerName`, so asking is enforced by the schema rather than requested in prose, and only at those two moments. Both go through one `resolveCallerName`: a name given now beats one already stored, it is written to `callers.name` when a row exists, and it falls back to the stored name.

`endCall` uses `ctx.session.shutdown({ drain: true })`.

## Booking

`packages/core/src/domain/scheduling.ts` is pure: no database, no network, and `now` is passed in.

- `zonedWallClockToUtc` corrects the offset in two passes, since the offset depends on the instant being solved for. No date dependency: Temporal is not stable in Node 22.
- `generateCandidateSlots` walks a 15-minute grid of **appointment** starts, so quoted times land on the quarter hour rather than wherever padding pushed them. Each interval carries its own edges, so a lunch split has four rather than two.
- `filterByBusy` compares the **padded block** against freeBusy, so cleanup after the previous job counts as a conflict.
- `findService` matches what a caller says against the catalogue: exact, then case-insensitive, then containment. Null rather than a guess between two candidates.

`providers/calendar.ts` only fetches. Google can say what is taken; deciding what exists needs the opening hours and the service length.

The tools take an intent and hand back opaque handles:

```
checkAvailability(service, preferredDate?, partOfDay?) -> { slots: [{ slotId, time }], note? }
bookAppointment(slotId)
```

Slot handles live in a per-call `Map` on `AgentDeps` and die with the call. `bookAppointment` re-checks freeBusy immediately before writing, because the slot was computed while the caller was still deciding. Calendar events span the padded block.

## Telephony

One deployment-wide SIP dispatch rule with an empty inbound routing filter. Listing numbers there breaks every agent added afterwards. The agent is resolved at runtime by joining `sip.trunkPhoneNumber` against `phone_numbers.e164`.

A dispatch rule created without `trunk_ids` matches every inbound trunk, so a second per-agent rule collides with the first. A rule's `inbound_numbers` filters the *caller's* number, not the dialled one, so it cannot route by agent either.

The LiveKit Phone Numbers API is not in `livekit-server-sdk` for Node; `providers/telephony.ts` calls the Twirp API over HTTP.

## Auth

Every `/api/admin/*` route passes `clerkAuth` then `requireAgent`, which resolves the agent from the verified Clerk user id and puts `agentId` on the Hono context.

"Onboarded" is derived from the agent row through `GET /api/onboarding/session`, which sits outside `requireAgent` because that middleware 404s exactly when the answer is no. It is deliberately not a flag on the identity: being onboarded is a fact about the business, and holding it in two places lets them disagree.

Clerk's redirect environment variables are unused; `signInUrl`, `signUpUrl` and `afterSignOutUrl` are props on `<ClerkProvider>` in `main.tsx`. The Google Calendar redirect carries `?returnTo=/appointments`, which `SSOCallback` passes to `signInForceRedirectUrl`.

## Dashboard

### Colour

`apps/web/src/index.css` is one anchor and a table of departures. The stage is the anchor, the rail sits below it, a card above. Every surface, line, control fill and ink rung derives with `calc()` inside `lch()` from `--base-l/c/h` and a `--contrast` dial.

Four laws, all enforced by `apps/web/src/tests/design-tokens.test.ts`:

1. **Surfaces, borders and controls are additive.** Surfaces and lines travel toward the ink, controls toward white and back when pointed at.
2. **Ink is proportional.** A mix toward the dark pole rather than a fixed distance, so text barely moves when the surface does.
3. **Chroma re-anchors.** Every ground-dependent chroma builds from `--ground-c`, never pinned flat.
4. **Chroma is proportional to lightness**, `dc = -0.145 x dL` capped at 1.20.

`[data-ground]` re-declares the whole derived layer, which is load-bearing: a custom property substitutes its `var()`s where it is declared, so one declared on `:root` bakes in `:root`'s ground.

The focus ring is black at 8.8%. White composites to nothing on paper.

### Elevation

| rung | radius | edge | shadow |
|---|---|---|---|
| control | `rounded-lg` 8px | `border-input` 0.5px | `shadow-control` |
| card | `rounded-xl` 10px | none | `shadow-control` |
| menu | `rounded-2xl` 12px | `border-border` 0.5px | `shadow-medium` |
| modal | `rounded-2xl` 12px | `border-border` 0.5px | `shadow-high` |

Three radii, one per rung, because near white the fills run out of room and radius has to carry depth alongside the shadow.

### Focus

One rule in `index.css`, and components add nothing. The outline lies over the control's own border at `outline-offset: -1px`, so nothing grows and no second ring appears. Focus never recolours a border.

A control filled with `--primary` wears the ring's own colour and would measure 1.00:1, so the default Button, a checked Switch and the Slider thumb carry `data-on-accent` and step the outline out by a pixel of page. An ancestor with `overflow: hidden` clips it.

### Type

Host Grotesk, six sizes. `--text-*` is cleared first so Tailwind's scale cannot supply a seventh. `--text-md` at 18px sits between `base` and `lg` for the handover note on Home. Body weight is 450, which is what lets 14px read crisp without reading bold. Nothing is below 14px, checked over `@theme` and over the component files for arbitrary values.

### Widths

The rule is naming versus measuring, not a ban on pixels: `--container-page: 960px` is itself a pixel value. Tokens live once in `index.css` where each carries a name, and a call site says `max-w-page`. A component may own its own width in one place, which the drawer does. `--container-narrow` at 640px is one column of form read once: onboarding and the escalation queue.

A field's width is a claim about the answer: `w-field-xs` a number, `sm` a time, `md` a name, `lg` a line of prose.

### Settings

Every setting is one row: title and a one-line description on the left, the control on the right, rows stacked in a card. `SettingsList.tsx` holds `Section`, `Row`, `ActionRow`, `OpenRow` and `SubRow`. A row that needs editing opens in place, and the button that opened it closes it.

Extra time on a service is opt-in, and is one row rather than a list: the schema is two integer columns, so an "add another" would model something unstorable.

Every duration and count is `NumberField`, digits only with the unit painted inside the box. Minutes is the unit you edit in; `formatMinutes` is the unit you read in.

One `SaveBar` per panel, at the foot, naming what is unsaved. The recording switch is the exception, being a single independently-valid boolean that commits when it moves.

### Pages

**Home** answers what needs you and whether this was worth paying for. A handover note in the receptionist's own voice, then the setup checklist, then the call log grouped by day. The note is two lines because they measure different things: the first is scoped by the period pills and the second counts every pending escalation regardless of date, which `repositories/metrics.ts` does deliberately.

The checklist has three states. With no calls it is the page. Once calls arrive it collapses to one dismissible line above the log. Dismissed or finished it goes, and a **Finish setup** entry with a count sits in the rail while anything is outstanding, which is what makes dismissing safe.

**Escalations** at `/escalations` is the whole list filtered by status; `/escalations/queue` is one question at a time. **Appointments** is a week strip that filters to a day. **Knowledge** is search over question and answer pairs. **Onboarding** is one page: business name, kind of business, timezone, then a number. **Connections** holds the phone number and the calendar, each in a drawer. The phone number has no disconnect, because releasing it is irreversible.

There are no centred empty states on a list page. A page with a heading, filters and a table header already explains itself, so one muted line sits where the rows would be. `layout/EmptyState.tsx` survives for genuinely blank pages: the escalation queue and 404.

### Registry components

`shadcn add` writes `dark:`, `data-horizontal:` and `data-vertical:` utilities that are inert here, and registry fills use `--muted`, which in this product is the stage rather than a muted surface. The dark variant is bound to `@custom-variant dark (&:where(.dark, .dark *))`, a class nothing applies, so a registry `dark:` utility cannot win on a machine in dark mode. A real dark theme arrives by adding `.dark` and a second set of token values.

## Tests

Three vitest projects split by filename, all driven by the root `vitest.config.ts`: `*.test.ts` needs nothing, `*.int.test.ts` needs the Docker Postgres, `*.live.test.ts` needs real credentials and spends tokens.

Test environment lives in `vitest.config.ts`, where `.gitignore` leaves it tracked. `scripts/test-db-url.mjs` asks Docker which host port the test database took, and both `vitest.config.ts` and the `test:int` migration read it from there, so the suite names the test container whatever port is free and a migration reaches only that container.

`packages/core/tests/factories.ts` builds database fixtures for integration tests. `apps/voice/src/receptionist/fixtures.ts` builds pure fixtures for unit tests and touches no database.

## Licence obligations

AGPL-3.0. Section 13 requires that anyone interacting with a modified version over a network can obtain its source, so `AppLayout.tsx` carries a Source link in the sidebar footer. A fork that changes the code repoints that link at itself.

AGPL asks for no `NOTICE` file; that is an Apache-2.0 convention. Per-file copyright headers are the FSF's recommendation rather than a term of the licence, and a whole-project `LICENSE` plus the README notice satisfies it.

## Local tooling

`seed.mjs` at the repository root, untracked and absent from `package.json`.

```
node --env-file=apps/api/.env seed.mjs          # add the dummy rows
node --env-file=apps/api/.env seed.mjs --clear  # take them away
```

It seeds onto an agent created by signing up and never invents one, so the number on the row was really purchased. Rows are stamped in a free-text column and `--clear` removes exactly those; a service typed by hand or a genuine call is never caught. Callers are matched on the fixed 555 numbers it inserts, since a phone number has nowhere to carry a stamp. It uses raw SQL through `pg` rather than Drizzle, so it survives schema helpers moving.

Two things to know. Seeding skips onboarding, so onboarding is exercised only by hand. And the after-hours flag on a seeded call must not key off the same counter as its outcome, or every booked call lands out of hours, which ruins the one figure the seed exists to make believable.

## Decisions, and the measurements behind them

Each rule is stated in one line where the code enforces it. The argument lives here.

### A turn either calls a tool or it talks

Without the guard a caller hears `"_1} Wait, the user did not offer their name yet..."`, the tail of `{"slotId": "slot_1"}` followed by the model's private deliberation. `_1}` is easy to pattern-match; "Wait, the user did not offer their name yet" is ordinary English, and any regex strong enough to catch it will eventually eat a real sentence. So the rule is about the shape of the turn, not its words. The turn is buffered to end of stream first, because the tool call can arrive after the text.

### There is no hold phrase

Speech is a queue, so a phrase covering a slow tool stands in front of that tool's answer rather than beside it. Measured 2026-08-28: filler at 40.463, `booked:true` at 42.770, the model finished the confirmation at 44.358, the filler stopped at 45.465, and the confirmation was discarded at 45.467. The caller sat in silence until they asked whether it was done. `RunContext.filler` speaks through `AgentSession.say` and creates the same competing handle. The tools measure 400ms to 3.2s; genuinely slow work uses `RunContext.update()`, which makes the tool non-blocking.

### `turnHandling.turnDetection` is left undefined

That is what makes the SDK auto-provision the audio `inference.TurnDetector` and, because it is a streaming detector, drop the endpointing floor from 500/3000ms to 300/2500ms. Setting anything there, `MultilingualModel` included, forfeits both. Confirmed at runtime by `initializing inference runner: lk_eot_audio`.

### Preemptive TTS is off

Preemptive generation is on: the LLM starts before end-of-turn is confirmed, which is where the latency win is, and a discarded guess costs only tokens. Preemptive TTS synthesises that guess into audio, and LiveKit's docs state that a speculative response is discarded and regenerated when the chat context or tools change. Audio made from a discarded guess is audio already on its way to the caller. It is also how a slow LLM opens a TTS socket that times out before the first token arrives, giving correct text and no audio.

### Telephony noise cancellation is SIP-only

`TelephonyBackgroundVoiceCancellation()` is tuned for 8kHz phone audio and runs before VAD, STT and turn detection, so it is a turn-detection accuracy fix rather than an audio nicety. Browser test sessions come from a laptop microphone at full bandwidth and must not get it.

### Extra time is dropped, not moved, at the edges of an opening period

Before-time protects the appointment before this one, and the first of the day has nothing behind it. So a 45-minute service with 15 minutes of setup is offered 9:00 in a shop opening at 9:00, with the calendar holding from 9:00, and never 9:00 with a hold from 8:45, because nobody is there at 8:45. Closing mirrors it: the appointment may end exactly at close, and the clearing up is not held on a calendar the business has shut. Requiring the whole padded block to fit inside the period costs a 9-to-5 shop both its 9:00 and its 4:50.

### Postgres claims the slot

`bookAppointment` re-checks freeBusy immediately before writing, which catches a slot taken by a human with the diary open. Google reports a write only once it propagates, so two callers offered one slot both read it free and both are told the same time. `appointments_no_overlap` settles it: the constraint excludes overlapping `tstzrange(block_start, block_end)` per agent over confirmed rows, and the second insert waits on the first and then fails with `23P01`. The range is half-open, so an appointment ending at 15:00 sits beside one starting there, on the same edge `filterByBusy` uses.

Both NULL guards are load-bearing: `tstzrange(NULL, NULL)` is the unbounded range, so the constraint takes only rows carrying a block.

The row is claimed first and the calendar event written second, because a constraint that rejects after the event exists leaves an event nothing points at. A failed event write downgrades the row to `requested` and clears the block, which releases it.

### A calendar event spans the padded block

An event covering only `start` to `end` leaves freeBusy reporting the setup and cleanup free, and the next booking lands on top of the previous job's cleanup. The event title states the appointment window in the business's own zone, because Google renders the event itself in the viewer's zone.

### A withheld caller ID is no identity

A placeholder such as `"unknown"` becomes the upsert key for `callers`, which is unique on `(agent_id, phone_number)`, and the lookup key in `getUpcomingByPhone`. Every anonymous caller to one business collapses into a single row, and the agent reads one caller's appointments to the next. Caller ID is also trivially spoofable, so even a present number is weak identity; confirming a second factor before reading appointments aloud is a separate open decision.

### Escalation inserts first and reads second

SELECT-then-INSERT is a race two tool calls in one turn both lose: both miss the SELECT, both insert, and the partial unique index makes the second throw out of the tool mid-call. Measured: on a cold pool, TCP and TLS establishment staggers the SELECTs enough that eight concurrent calls all succeed. On a warm pool the same eight produce one insert and seven unique-violation failures. `db/client.ts` sets `keepAlive` with a 30s idle timeout so sockets stay open, which makes the warm case the normal one.

### The disclosure is platform-owned and plays before the greeting

California AB 2905 and SB 243 require a caller to be told they are speaking to an AI before any substantive interaction, at $500 per call, and the greeting is agent-authored free text. Two wordings, chosen by `record_calls`: the AI half is never optional, the recording clause is, because a greeting claiming a call is recorded when it is not is its own kind of wrong. `buildGreeting` returns the text and its version together, so nothing stamps a call with a wording the caller never heard. `calls.disclosure_version` is the audit trail: `2026-08-v1` recorded, `2026-08-norec-v1` not.

### Recording reads one derived value

`recordingEnabled()` ANDs the owner's `record_calls` preference with `storageConfigured`. The disclosure and the egress call both read it, so they cannot disagree about whether a call is recorded.

### Room composite egress, audio only

LiveKit documents room composite with `audio_only` as the path to a single mixed audio file, and setting `layout` or `custom_base_url` is what forces the video pipeline. Track egress would produce one file per participant.

### A larger model summarises worse

Post-call summaries run a small model with reasoning off. Larger ones embellish and invent follow-ups that were never discussed.

### The area code is three digits or absent

Measured against the live LiveKit API on 2026-09-03:

| sent | result |
|---|---|
| omitted, or `""` | 200, ten numbers |
| `"484"` | 200, ten numbers |
| `484` as a number | 400 `malformed`, the field is a string |
| `"4"`, `"50"` | 400 `invalid_argument`, "Failed to search phone numbers" |
| `"999"` | 200, zero items |

A partial code is a caller mistake the carrier reports as an opaque failure, so `searchPhoneNumbers` checks the length itself. A well-formed code with nothing free is an empty list, which is its own case.

### Model latency is measured, not assumed

Time to first token through LiveKit Inference, three samples from India: `openai/gpt-4o-mini` 935/1616/822ms, `google/gemini-3.5-flash` 1628/1859/1268ms. `MetricsCollected` is wired, so `grep '\[metrics\]'` in the worker log gives real p50 and p95 per call. The greeting is unaffected by model choice, since `session.say()` sends a fixed string straight to TTS.

### Versioning

`major.minor.patch` in the root `package.json` only. Every package is `private: true` with no `version` field, and `workspace:*` links by name. One patch bump per commit that changes what a customer runs, in the same commit as the work. `minor` is a release worth describing as new capability; `major` breaks the API contract or a database shape somebody has to think about.
