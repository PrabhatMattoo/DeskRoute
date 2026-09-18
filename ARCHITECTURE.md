# Architecture

This is the guided tour of DeskRoute: what the pieces are, how a call moves through them, and why the load-bearing parts are built the way they are. `CLAUDE.md` holds the rules an agent must follow and points here for the explanation, so nothing is stated in both places.

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
- [The HTTP API](#the-http-api)
- [Dashboard](#dashboard)
- [Tests](#tests)
- [Local tooling](#local-tooling)
- [Decisions, and the measurements behind them](#decisions-and-the-measurements-behind-them)

## The domain

Start with the four nouns everything else is built from.

An **agent** is a business's phone presence: its hours, services, calendar, persona, knowledge base, and one or more phone numbers. A single deployment holds one or more of them. Two shops is two agents, and so is one shop running a sales line beside a support line.

A **caller** is someone who phoned. A **call** is one conversation, with its transcript, summary, outcome and recording key. An **escalation** is a question the agent could not answer, queued for the owner; answering it writes a **knowledge item**, which the agent then reads on every later call.

The one invariant that runs through the whole system: every table carries an `agent_id`, and every repository function takes an `agentId` first. The LLM never receives or chooses one. That is what keeps two businesses on the same deployment from ever seeing each other's data.

## Repository layout

```
apps/api         Hono server, one module per resource under src/modules
apps/voice       LiveKit worker
apps/web         Admin dashboard
packages/core    db, repositories, providers, domain, env
packages/shared  Domain schemas, the types they infer, and constants, also consumed by the browser
tests/           The three vitest setup files
```

`packages/core` is split by what a thing talks to. `db/` holds the schema and the connection. `repositories/` wrap Drizzle and are the only code that reads or writes Postgres. `providers/` reach outward — to Google Calendar, LiveKit and R2. `domain/` is pure logic with no I/O, which is what makes it testable without booting anything.

`apps/voice/src` is split by lifetime instead. `receptionist/` is what LiveKit dispatches under the name `receptionist`: the `Agent` subclass, its instructions, its tools, the turn rule and the greeting — in short, what the agent *is*. `session/` is one `AgentSession`: which agent answers, how the speech pipeline is wired, who is calling, and what the call leaves behind.

`packages/shared/src/schemas.ts` declares each domain shape once, as a Zod schema. That single declaration does three jobs: `z.infer` gives the type every package reads, `bookingPolicySchema.parse({})` gives the defaults, and `apps/api` validates request bodies against the very same object. Declare the shape once, and the type, the default and the validator can never drift apart.

Cross-package imports use the package name with a `.js` specifier, for example `@receptionist/core/repositories/calls.js`. `@receptionist/core` publishes `./*.js` mapping to `./src/*.ts`, and `./tests/*.js` to `./tests/*.ts`. There is no build step in between: the TypeScript source is consumed directly through the `exports` field.

Unit tests sit beside their subject. Integration, live and whole-system contract tests get their own `tests/` folder, because they span modules or read files off disk and so have no single subject to sit beside.

## Processes

Two processes run in production, plus the static dashboard.

**`apps/api`** is a Hono server on `PORT`. `routes.ts` mounts one chained `Hono` instance per resource with `app.route()`, and exports the `AppRoutes` type for the RPC client. Handlers live directly on their routes, for two reasons that pull the same way: Hono infers path parameters only where the handler and its route sit together, and `hc<AppRoutes>()` reads those chained definitions to type the dashboard's calls. Request bodies and query strings are validated at the route boundary with `@hono/zod-validator` — against the domain shapes from `packages/shared` and the request schemas in `apps/api/src/schemas.ts` — so a handler only ever runs on input that already has the right shape. Errors bubble to a single `onError` in `app.ts`; the one deliberate exception is phone-number provisioning, which releases the number it just bought before re-throwing.

**`apps/voice`** is a long-running LiveKit worker that handles every concurrent call. It connects out to LiveKit and is never connected to.

## Environment

Each package declares what it reads, and every schema reads `process.env` and nothing else. `packages/core` owns `DATABASE_URL`, `LIVEKIT_*`, `CLERK_SECRET_KEY` and `R2_*`. `apps/api` adds `PORT`, `DASHBOARD_ORIGINS` and `CLERK_PUBLISHABLE_KEY`. `apps/voice` adds `LLM_*` and `OPENROUTER_*`.

`parseEnv` in `packages/core/src/env.ts` drops blank values before parsing, so `FOO=` falls through to `.optional()` and `.default()` as though the line were absent. It throws on a bad value rather than exiting, because a module-level `process.exit` would take down anything that imported it transitively — the test runner included.

`.env` files are a development convenience, loaded by each app's dev script with `--env-file-if-exists` from its own directory. Nothing in production reads a file: Docker Compose injects `env_file:` into the container and the process reads `process.env`. Each package ships an `.env.example` beside it.

`R2_*` is treated as all four variables or none. A partial set reads as configured and then fails per call, which is the one arrangement that would let recording claim to be on while silently dropping audio.

## Database

Postgres 17, Drizzle, migrations in `packages/core/drizzle`. `docker-compose.yml` runs a persistent database on `DESKROUTE_DB_PORT` (default 5432) and a throwaway tmpfs one for tests on a port Docker picks.

**`agents`** is the configuration row. `business_name` is the shop and `persona_name` is what the receptionist calls itself, kept separate so renaming one leaves the other alone. `greeting`, `farewell`, `fallback`, `min_notice_minutes`, `max_advance_days`, `checklist_dismissed` and `hours_seen` are flat columns. `business_hours` stays `jsonb`, because it is read whole and never queried into; it carries a weekly pattern of several intervals per day plus date exceptions that replace the pattern outright. Its times are local wall clock, read against `timezone` rather than stored as UTC, so "we open at 9" survives daylight saving.

**`phone_numbers`** is its own table so a number can be added or removed without writing to the agent row. `e164` is globally unique, which is what lets a dialled number resolve to exactly one agent.

**`callers`** is unique on `(agent_id, phone_number)`, and `phone_number` is `NOT NULL`. A withheld caller ID therefore stores no row at all, rather than a placeholder that every anonymous caller would collapse into.

**`calls`** carries a nullable `caller_phone`, plus `room_name`, `transcript` as `jsonb`, `summary`, `recording_key` and `disclosure_version`. `recording_key` is an object key; the playable URL is presigned per request.

**`escalations`** carries its own `caller_name`, because an anonymous caller has no `callers` row to hang one on. Its dedup index is unique on `(call_id, lower(question))` where `call_id IS NOT NULL`, and status is either `pending` or `resolved`.

**`services`** is a table so that a booking can point at a permanent id that survives a rename. `services_agent_name_idx` is unique on `(agent_id, lower(trim(name)))` — the exact comparison `serviceByName` makes — so one spoken name reaches one row. `required_resources` is `string[]`, plural from day one and empty for everyone so far.

**`appointments`** holds `service_id` with `ON DELETE SET NULL` beside `service_name`, the name as it stood at booking, and its own `caller_name`. `external_event_id` names the event in whichever provider `agents.calendar_provider` names. `block_start` and `block_end` are the padded block — the appointment plus its setup and cleanup — carried so the overlap guard can reserve it. They are null on a request that holds no time.

Most of the schema is expressible in Drizzle, so it lives in the regenerated `0000_init`. The one thing that is not is `appointments_no_overlap`, an exclusion constraint, so it lives by hand in `0001_booking_overlap_guard.sql`. Drizzle owns `0000_init` and regenerates it freely; the hand-written SQL sits in numbered files after it and stays as written.

## The call path

`worker.ts` runs one job per call, in this order:

```
ctx.connect() -> waitForParticipant() -> resolveAgent(trunkPhone, or agentId for a test session)
  -> buildSessionConfig() -> session.start() -> session.say(greeting)
  -> [background] startCallRecording, upsertCaller, createCall
```

`ctx.connect()` has to come first, because `sip.trunkPhoneNumber` — the dialled number that tells us which agent should answer — is only available once `waitForParticipant()` resolves. Of the two SIP attributes that matter, `sip.phoneNumber` is who is calling and `sip.trunkPhoneNumber` is the number they dialled.

The database writes and the recording are deliberately deferred until after the greeting has started playing, so the caller hears audio without waiting on a round trip. That leaves a brief window where the agent is live but the `calls` row does not exist yet, so anything that needs to write a foreign key to it waits on `callRowReady` — which keeps the path to first audio clear.

Agent resolution is cached in `session/resolve-agent.ts` with a five-minute TTL and a 500-entry LRU. The agent, its services and its knowledge all expire together, since all three are folded into one prompt.

Browser test sessions take a shortcut through the same path. They carry `testSession: "true"` and an `agentId` in their participant attributes, so the worker resolves by id and skips recording, the `calls` row and the `callers` row. Booking still runs in full: `checkAvailability` and `bookAppointment` write a real appointment and a real calendar event. Test rooms reach the agent through explicit dispatch in the join token's `RoomConfiguration`.

## The receptionist

`receptionist/agent.ts` exports `ReceptionistAgent extends voice.Agent`, composing the instructions, the tools and the turn rule. It lives in its own module with no side effects, because `worker.ts` calls `cli.runApp()` at the top level and the test harness keys on the constructor.

The division of labour between the prompt and the tools is worth stating plainly: the prompt states facts, and the tools state procedure. `buildSystemPrompt` says who the agent is, what the business sells, when it opens and what it knows — and it never names a tool, which `prompt.test.ts` asserts. How and when to use a tool lives on that tool's own description and parameters, where the model reads it at the moment it matters. Everything above the "Caller" heading in the prompt is identical across calls and forms a cacheable prefix; everything below it changes per call.

The knowledge base is inlined into the prompt at call start, capped at 300 items by `KNOWLEDGE_PROMPT_LIMIT`. There is no retrieval tool, because there is nothing to retrieve from — the answers are already in front of the model.

The service catalogue reaches the model as a schema rather than as free text. `checkAvailability` types its `service` parameter as a `z.enum` over the agent's own service names, so the model chooses from the list at the moment it reads the caller and never hands a loose phrase back for the backend to guess at. A business that lists no services is given neither booking tool, since a tool the model never holds is one it cannot reach for.

`bookAppointment` and `createEscalation` both take a `callerName`, so the agent is made to ask for a name at exactly those two moments and no others. Both run it through one `resolveCallerName`: a name given now beats one already stored, it is written to `callers.name` when a row exists, and it falls back to the stored name otherwise. Ending a call goes through `ctx.session.shutdown({ drain: true })`.

## Booking

`packages/core/src/domain/scheduling.ts` is pure — no database, no network, and `now` is passed in — which is what lets the whole slot calculation be tested without a clock or a connection.

- `zonedWallClockToUtc` corrects the offset in two passes, because the offset itself depends on the instant being solved for. It takes no date library: Temporal is not yet stable in Node 22.
- `generateCandidateSlots` walks a 15-minute grid of *appointment* starts, so quoted times land on the quarter hour. Each opening interval carries its own edges, so a day split by a lunch closure carries four of them.
- `filterByBusy` compares the *padded* block against freeBusy, so the cleanup time after the previous job counts as a conflict.
- `serviceByName` reads a catalogue name back to its service, ignoring case and surrounding space. It returns null for a name the catalogue does not hold, which is a case a model that left the enum unenforced could still produce.

`providers/calendar.ts` only fetches. Google can say what is already taken, but deciding what *exists* needs the opening hours and the service length, which is domain logic rather than a calendar query.

The tools take an intent and hand back opaque handles:

```
checkAvailability(service, preferredDate?, partOfDay?) -> { slots: [{ slotId, time }], note? }
bookAppointment(slotId)
```

Those slot handles live in a per-call `Map` on `AgentDeps` and die with the call. `bookAppointment` re-checks freeBusy immediately before writing, because the slot was computed while the caller was still deciding, and the calendar can move underneath them. The calendar event it writes spans the padded block.

## Telephony

There is one deployment-wide SIP dispatch rule, with an empty inbound routing filter. The agent is resolved at runtime by joining `sip.trunkPhoneNumber` against `phone_numbers.e164`. It is tempting to reach for a per-agent rule instead, and it does not work: a dispatch rule created without `trunk_ids` matches every inbound trunk, so a second per-agent rule collides with the first, and a rule's `inbound_numbers` filters the *caller's* number rather than the dialled one, so it cannot route by agent either. Listing numbers in the rule breaks every agent added after it.

The LiveKit Phone Numbers API is not in `livekit-server-sdk` for Node, so `providers/telephony.ts` calls the Twirp API over HTTP directly.

## Auth

Every `/api/admin/*` route passes through `clerkAuth` and then `requireAgent`, which resolves the agent from the verified Clerk user id and puts `agentId` on the Hono context. From there the handler reads `agentId` and never sees the user.

Whether a business is "onboarded" is derived from the agent row, through `GET /api/onboarding/session`, which sits outside `requireAgent` — because that middleware answers 404 in exactly the case the onboarding check is asking about. Onboarding is deliberately not a flag on the identity: being onboarded is a fact about the business, and holding the same fact in two places is an invitation for them to disagree.

Clerk's redirect environment variables go unused; `signInUrl`, `signUpUrl` and `afterSignOutUrl` are props on `<ClerkProvider>` in `main.tsx`. The Google Calendar redirect carries `?returnTo=/appointments`, which `SSOCallback` passes on to `signInForceRedirectUrl`.

## The HTTP API

The dashboard reaches the server through the Hono RPC client, so every route is typed end to end: the response type a page reads is inferred from the handler that produces it. `/api/onboarding/*` and `/api/health` are public; every `/api/admin/*` route carries `Authorization: Bearer <clerk_jwt>` and resolves its agent through `requireAgent`.

Public:

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness check |
| GET | `/api/onboarding/session` | Whether the business is onboarded |
| GET | `/api/onboarding/phone/search?areaCode=415` | Search available numbers (`areaCode` optional) |
| POST | `/api/onboarding` | Create an agent and purchase a phone number |

Admin, under `Authorization: Bearer <clerk_jwt>`:

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/metrics?period=30d` | KPI counts |
| GET | `/api/admin/calls` | Paginated call history |
| GET | `/api/admin/calls/:id` | Call detail with transcript |
| GET | `/api/admin/calls/:id/recording` | Presigned recording URL |
| GET | `/api/admin/escalations?status=pending` | Escalation list |
| POST | `/api/admin/escalations/:id/resolve` | Resolve and add to the knowledge base |
| GET | `/api/admin/knowledge` | Knowledge base items |
| DELETE | `/api/admin/knowledge/:id` | Delete a knowledge item |
| GET | `/api/admin/appointments` | Appointment list |
| GET | `/api/admin/services` | Services, in display order |
| POST | `/api/admin/services` | Add a service |
| PATCH | `/api/admin/services/:id` | Update a service |
| DELETE | `/api/admin/services/:id` | Remove a service |
| GET | `/api/admin/calendar/list` | Calendars the connected Google account can write to |
| PATCH | `/api/admin/calendar` | Choose which calendar holds appointments |
| DELETE | `/api/admin/calendar` | Disconnect the calendar |
| GET | `/api/admin/settings` | Agent settings, opening hours, booking window and recording |
| PATCH | `/api/admin/settings` | Update settings, hours or the booking window |
| GET | `/api/admin/phone/search?areaCode=415` | Search available numbers (`areaCode` optional) |
| POST | `/api/admin/phone/provision` | Purchase a phone number |
| DELETE | `/api/admin/phone` | Release a phone number |
| POST | `/api/admin/agent/test` | Create a browser test session (room and join token) |

## Dashboard

### Colour

`apps/web/src/index.css` is one anchor colour and a table of departures from it. The stage is the anchor, the rail sits below it and a card above; every surface, line, control fill and ink rung is derived with `calc()` inside `lch()` from `--base-l/c/h` and a `--contrast` dial. Four laws hold it together, all enforced by `apps/web/src/tests/design-tokens.test.ts`:

1. Surfaces, borders and controls are additive — surfaces and lines travel toward the ink, controls toward white and back when pointed at.
2. Ink is proportional: it mixes toward the dark pole, so text barely moves when the surface underneath it does.
3. Chroma re-anchors, so every ground-dependent chroma builds from `--ground-c` rather than being pinned flat.
4. Chroma stays proportional to lightness, `dc = -0.145 × dL`, capped at 1.20.

`[data-ground]` re-declares the whole derived layer, which is load-bearing rather than decorative: a custom property substitutes its `var()`s where it is declared, so one declared on `:root` bakes in `:root`'s ground. The focus ring is black at 8.8%, because white composites to nothing on paper.

### Elevation

| rung | radius | edge | shadow |
|---|---|---|---|
| control | `rounded-lg` 8px | `border-input` 0.5px | `shadow-control` |
| card | `rounded-xl` 10px | none | `shadow-control` |
| menu | `rounded-2xl` 12px | `border-border` 0.5px | `shadow-medium` |
| modal | `rounded-2xl` 12px | `border-border` 0.5px | `shadow-high` |

There are three radii, one per rung, because this near to white the fills run out of contrast and the radius has to carry some of the depth that the shadow can no longer manage alone.

### Focus

One rule in `index.css`, and the components add nothing to it. The outline lies over the control's own border at `outline-offset: -1px`, so nothing grows and no second ring appears, and focus never recolours a border. A control filled with `--primary` is the exception: it wears the ring's own colour and would measure 1.00:1, so the default Button, a checked Switch and the Slider thumb carry `data-on-accent` and step the outline out by a pixel of page. An ancestor with `overflow: hidden` will clip it.

### Type

Host Grotesk, six sizes. `--text-*` is cleared first so Tailwind's own scale cannot supply a seventh. `--text-md` at 18px sits between `base` and `lg`, for the handover note on Home. Body weight is 450, which is what lets 14px read crisp without reading bold. Nothing anywhere is below 14px, and the test checks both `@theme` and the component files, arbitrary values included.

### Widths

The rule is naming versus measuring. `--container-page: 960px` is itself a pixel value, so it lives once in `index.css` where it carries a name, and a call site says `max-w-page`. A component may own its own width in one place, which the drawer does. `--container-narrow` at 640px is a single column of form, read once for onboarding and once for the escalation queue.

A field's width is a claim about the answer it holds: `w-field-sm` for a time or a short code, `md` for a name or a chosen option, `lg` for a line of prose or a search. A control whose width follows its own content owns that width itself, as `NumberField` does from the length of its unit.

### Settings

Every setting is one row: a title and a one-line description on the left, the control beside them, rows stacked in a card. A control too wide to sit beside its label is `stacked` under it instead. `SettingsList.tsx` holds `Section`, `Row` and `SubRow`; `Row` and `SubRow` share one layout and one label between them, so a field behaves the same in a card as in a drawer. A row that needs real editing opens a drawer, which carries no rule between its fields, because the panel edge is already the boundary. Extra time on a service is opt-in and is itself one row, which is exactly what two integer columns can hold.

Every duration and count is a `NumberField` — digits only, with the unit painted inside the box, and the box measures its own unit so a short one leaves no dead space. `UNIT` in `lib/formatters.ts` holds the word, so `formatMinutes` and the field it is typed into always say the same thing. There is one `SaveBar` per panel, at the foot, naming what is unsaved. The recording switch is the exception: it is a single independently-valid boolean, so it commits the moment it moves.

### Pages

**Home** answers two questions — what needs you, and whether this was worth paying for. A handover note in the receptionist's own voice comes first, then the setup checklist, then the call log grouped by day. The note runs to two lines because they measure different things: the first is scoped by the period pills, and the second counts every pending escalation regardless of date, which `repositories/metrics.ts` does on purpose.

The checklist has three states. With no calls yet, it is the whole page. Once calls arrive it collapses to one dismissible line above the log. Dismissed or finished, it disappears, and a **Finish setup** entry with a count moves into the rail while anything is still outstanding — which is what makes dismissing it safe.

**Escalations** at `/escalations` is the whole list, filtered by status; `/escalations/queue` is one question at a time. **Appointments** is a week strip that filters down to a day. **Knowledge** is search over the question-and-answer pairs. **Onboarding** is a single page: business name, kind of business, timezone, then a number. **Connections** holds the phone number and the calendar, each in a drawer; the phone number has no disconnect, because releasing it is irreversible.

A list keeps its search and filters once loading ends, so an empty page holds the shape it will have when rows arrive. `layout/EmptyState.tsx` fills the space below for a list that has never held a row, titled by the state it is in, since the page heading already names the page. A filter that matches nothing gets a single muted line where the rows would be.

### Registry components

`shadcn add` writes `dark:`, `data-horizontal:` and `data-vertical:` utilities that are inert here, and its fills reach for `--muted`, which in this product is the stage rather than a muted surface. The dark variant is bound to `@custom-variant dark (&:where(.dark, .dark *))`, a class nothing applies, so a registry `dark:` utility cannot win even on a machine set to dark mode. A real dark theme, if it ever arrives, comes from adding `.dark` and a second set of token values — so anything `shadcn add` writes is retokenised on the way in, and a contract test scans for the utilities it ships that would do nothing here.

## Tests

Three vitest projects, split by filename and driven by the root `vitest.config.ts`. `*.test.ts` needs nothing. `*.int.test.ts` needs the Docker Postgres. `*.live.test.ts` needs real credentials and spends tokens.

The live suite reads the development database for an agent with a connected calendar, takes that agent's Google token the way a live call does, and books and cancels one labelled event to prove the padded block is actually reserved — an event covering only the appointment would leave freeBusy offering the setup and cleanup to the next caller. It writes nothing to the database and skips with a reason when no calendar is connected. `LIVE_AGENT_ID` points it at a specific agent.

The web suite is the colour contract. Every colour but the anchor is expressed as a departure from it, so `design-tokens.test.ts` asserts relationships rather than fixed values, and the four [Colour](#colour) laws go red the moment `index.css` breaks one.

The test environment lives in `vitest.config.ts`, which `.gitignore` leaves tracked. `scripts/test-db-url.mjs` asks Docker which host port the test database landed on, and both `vitest.config.ts` and the `test:int` migration read it from there — so the suite can name the test container whatever port is free, and a migration still reaches only that container.

`packages/core/tests/factories.ts` builds database fixtures for the integration tests. `apps/voice/src/receptionist/fixtures.ts` builds pure fixtures for the unit tests and touches no database.

## Licence obligations

DeskRoute is AGPL-3.0. Section 13 requires that anyone interacting with a modified version over a network can obtain its source, so `AppLayout.tsx` carries a Source link in the sidebar footer; a fork that changes the code repoints that link at itself. AGPL asks for no `NOTICE` file — that is an Apache-2.0 convention — and per-file copyright headers are an FSF recommendation rather than a term of the licence, so a whole-project `LICENSE` plus the README notice satisfies it.

## Local tooling

`seed.mjs` sits at the repository root, untracked and absent from `package.json`.

```
node --env-file=apps/api/.env seed.mjs          # add the dummy rows
node --env-file=apps/api/.env seed.mjs --clear  # take them away
```

It seeds onto an agent you created by signing up, and never invents one, so the number on the row was really purchased. Its rows are stamped in a free-text column and `--clear` removes exactly those; a service you typed by hand or a genuine call is never caught in the sweep. Callers are matched on the fixed 555 numbers it inserts, since a phone number has nowhere to carry a stamp. It talks to Postgres in raw SQL through `pg`, so it keeps working when a schema helper moves.

Two things are worth knowing. Seeding skips onboarding, so onboarding is only ever exercised by hand. And the after-hours flag on a seeded call must not key off the same counter as its outcome, or every booked call lands out of hours and ruins the one figure the seed exists to make believable.

## Decisions, and the measurements behind them

The rules in `CLAUDE.md` are stated where the code enforces them. This is where the argument for each one lives, with the numbers it rests on.

### A turn either calls a tool or it talks

Without the guard, a caller hears `"_1} Wait, the user did not offer their name yet…"` — the tail of `{"slotId": "slot_1"}` followed by the model thinking out loud. The interesting part is why the fix is structural rather than textual. `_1}` is easy to pattern-match, but "Wait, the user did not offer their name yet" is ordinary English, and any regex strong enough to catch it will eventually eat a real sentence. So the rule is about the shape of the turn, not its words: a turn speaks or it calls a tool, never both. The turn is buffered to end of stream first, because the tool call can arrive after the text.

### There is no hold phrase

Speech is a queue, so a phrase meant to cover a slow tool ends up standing in front of that tool's answer rather than beside it. The trace from 2026-08-28 tells the story: the filler played at 40.463, `booked:true` came back at 42.770, the model finished the confirmation at 44.358, the filler stopped at 45.465, and the confirmation was discarded two milliseconds later at 45.467. The caller sat in silence until they asked whether it was done. `RunContext.filler` speaks through `AgentSession.say` and creates the same competing handle, so it is out too. The tools themselves measure 400ms to 3.2s; genuinely slow work uses `RunContext.update()`, which makes the tool non-blocking instead of talking over it.

### `turnHandling.turnDetection` is left undefined

Leaving it undefined is what makes the SDK auto-provision the audio `inference.TurnDetector` and, because that is a streaming detector, drop the endpointing floor from 500/3000ms to 300/2500ms. Setting anything there at all — `MultilingualModel` included — forfeits both. The runtime confirms it: `initializing inference runner: lk_eot_audio`.

### Preemptive TTS is off

Preemptive *generation* stays on, because that is where the latency win is: the LLM starts before end-of-turn is confirmed, and a guess that gets thrown away costs only tokens. Preemptive *TTS* is the step too far. It synthesises that guess into audio, and LiveKit's own docs note that a speculative response is discarded and regenerated whenever the chat context or tools change — so audio built from a discarded guess is audio already on its way to the caller. It is also how a slow LLM opens a TTS socket that times out before the first token arrives, which leaves you with correct text and no sound.

### Telephony noise cancellation is SIP-only

`TelephonyBackgroundVoiceCancellation()` is tuned for 8kHz phone audio and runs before VAD, STT and turn detection, which makes it a turn-detection accuracy fix rather than a nicety. Browser test sessions come from a laptop microphone at full bandwidth, so they must not get it.

### Extra time is dropped at the edges of an opening period

Setup time protects the appointment before this one, and the first appointment of the day has nothing behind it to protect against. So a 45-minute service with 15 minutes of setup is offered 9:00 in a shop that opens at 9:00, with the calendar held from 9:00 — never 9:00 with a hold reaching back to 8:45, because nobody is there at 8:45. Closing mirrors it: the appointment may end exactly at close, and the clearing up is not held on a calendar the business has already shut. Requiring the whole padded block to fit inside the opening period would cost a nine-to-five shop both its 9:00 slot and its 4:50 one.

### Postgres claims the slot

`bookAppointment` re-checks freeBusy immediately before writing, which catches a slot a human just took with the diary open. But Google only reports a write once it has propagated, so two callers offered the same slot can both read it free and both be told the same time. `appointments_no_overlap` is what actually settles it: the constraint excludes overlapping `tstzrange(block_start, block_end)` per agent over confirmed rows, so the second insert waits on the first and then fails with `23P01`. The range is half-open, so an appointment ending at 15:00 sits cleanly beside one starting at 15:00 — the same edge `filterByBusy` uses. Both NULL guards are load-bearing, because `tstzrange(NULL, NULL)` is the unbounded range, and the constraint must take only rows that actually carry a block. The row is claimed first and the calendar event written second: a constraint that rejected *after* the event existed would leave an event nothing points at, so a failed event write instead downgrades the row to `requested` and clears the block, releasing it.

### A calendar event spans the padded block

An event covering only `start` to `end` would leave freeBusy reporting the setup and cleanup as free, and the next booking would land on top of the previous job's cleanup. So the event spans the whole padded block, and its title states the appointment window in the business's own zone — because Google renders the event itself in the *viewer's* zone, which is not necessarily the same one.

### A withheld caller ID is no identity

The temptation is to store a placeholder like `"unknown"`. It backfires: that placeholder becomes the upsert key for `callers`, which is unique on `(agent_id, phone_number)`, and the lookup key in `getUpcomingByPhone`. Every anonymous caller to one business would collapse into a single row, and the agent would read one caller's appointments out to the next. So a withheld number stores no row. Caller ID is weak identity in any case, since it is trivially spoofable; confirming a second factor before reading appointments aloud is a separate open question.

### Escalation inserts first and reads second

SELECT-then-INSERT is a race that two tool calls in one turn both lose: both miss the SELECT, both insert, and the partial unique index makes the second throw out of the tool mid-call. The measurements are counterintuitive. On a cold pool, TCP and TLS establishment staggers the SELECTs enough that eight concurrent calls all succeed. On a warm pool the same eight produce one insert and seven unique-violation failures. `db/client.ts` sets `keepAlive` with a 30-second idle timeout so sockets stay open — which makes the warm case the normal one, and the insert-first ordering the thing that saves it.

### The disclosure is platform-owned and plays before the greeting

California's AB 2905 and SB 243 require a caller to be told they are speaking to an AI before any substantive interaction, at $500 per call, and the greeting is agent-authored free text that cannot be trusted to carry it. There are two wordings, chosen by `record_calls`: the AI half is never optional, and the recording clause is, because a greeting that claims a call is recorded when it is not is its own kind of wrong. `buildGreeting` returns the text and its version together, so nothing can stamp a call with a wording the caller never heard. `calls.disclosure_version` is the audit trail — `2026-08-v1` for recorded, `2026-08-norec-v1` for not.

### Recording reads one derived value

`recordingEnabled()` ANDs the owner's `record_calls` preference with `storageConfigured`. The disclosure and the egress call both read that one derived value, so the two can never disagree about whether a call is being recorded.

### Room composite egress, audio only

LiveKit documents room composite with `audio_only` as the path to a single mixed audio file, and setting `layout` or `custom_base_url` is what forces the video pipeline into play. Track egress would produce one file per participant instead of the single recording we want.

### A larger model summarises worse

Post-call summaries run a small model with reasoning turned off. Larger ones embellish, and invent follow-ups that were never discussed.

### The area code is three digits or absent

Measured against the live LiveKit API on 2026-09-03:

| sent | result |
|---|---|
| omitted, or `""` | 200, ten numbers |
| `"484"` | 200, ten numbers |
| `484` as a number | 400 `malformed`, the field is a string |
| `"4"`, `"50"` | 400 `invalid_argument`, "Failed to search phone numbers" |
| `"999"` | 200, zero items |

A partial code is a caller's mistake that the carrier reports as an opaque failure, so `searchPhoneNumbers` checks the length itself before sending. A well-formed code with nothing free comes back as an empty list, which is its own, legitimate case.

### Model latency is measured

Time to first token through LiveKit Inference, three samples from India: `openai/gpt-4o-mini` at 935/1616/822ms, `google/gemini-3.5-flash` at 1628/1859/1268ms. `MetricsCollected` is wired, so `grep '\[metrics\]'` in the worker log gives real p50 and p95 per call. The greeting is unaffected by the model choice, since `session.say()` sends a fixed string straight to TTS.

### Versioning

`major.minor.patch` lives in the root `package.json` alone. Every package is `private: true` with no `version` field, and `workspace:*` links them by name. One patch bump goes in per commit that changes what a customer runs, in the same commit as the work. A `minor` is a release worth describing as a new capability; a `major` breaks the API contract or a database shape someone has to think about.
