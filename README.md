# DeskRoute

DeskRoute is an AI receptionist for appointment-based local businesses. A customer rings a real US phone number, DeskRoute picks up, answers what it can from what you have told it, books appointments straight into Google Calendar, and hands you anything it could not deal with through an admin dashboard.

It is self-hosted and open source. You run it, you own the data, and one deployment can answer for one business or several. A salon with a single line is one agent; a shop running a sales line beside a support line is two. Nothing here assumes a company sits above you.

**[ARCHITECTURE.md](ARCHITECTURE.md)** is the guided tour of the whole system: how a call flows through it, the shape of the database, the HTTP API, the design system behind the dashboard, the test suites, and the reasoning behind the rules.

## How it works

Follow one call from the moment the phone rings.

A customer dials your number. LiveKit answers the SIP leg and hands the call to the agent worker, which looks the dialled number up in `phone_numbers` to decide which business is being called. That agent builds its system prompt from everything you have configured — your services and prices, your opening hours, the whole knowledge base — and starts talking. The law in several US states says a caller must be told they are speaking to an AI before anything else happens, so that disclosure plays first, mentioning recording only when recording is switched on, and your own greeting comes right after.

From there it is a conversation. Speech becomes text, the model replies, the reply becomes speech, and an audio turn detector works out when the caller has actually finished rather than just paused. Most questions never need a tool call: pricing, hours and knowledge-base answers are already in the prompt, so the agent just says them. When a caller wants to book, the agent asks what service and roughly when; the backend works out which slots genuinely exist from your hours and that service's length, and reads back two or three. The caller picks one, the agent takes their name, and the appointment is written into your calendar. A question the agent cannot answer is flagged for you instead of guessed at. When the call ends, the transcript is pulled out, a summary is written, and the record is closed.

## Features

- **Real phone calls.** Numbers come through LiveKit Phone Numbers, so there is no SIP trunk to stand up yourself.
- **Answers straight from context.** Services, pricing, business details and the entire knowledge base are baked into the system prompt when the call starts, so common questions need no tool call and no retrieval round trip.
- **A knowledge base that grows itself.** Every escalation you answer becomes a question-and-answer pair the agent reads on every later call, so it only has to ask you once.
- **Opening hours that hold up.** A weekly pattern with lunch closures and days you are shut, plus one-off dates for holidays. Your agent can answer "are you open Saturday?" without checking with you.
- **Services with real durations.** Each service has its own length, and optional setup and cleanup time that blocks your calendar without the caller ever hearing about it.
- **Booking that respects both the diary and the clock.** The agent offers only times you are open, long enough for the service booked, and free on your calendar. It re-checks the instant before it books, so a slot taken mid-conversation never becomes a double booking.
- **A legally required AI disclosure on every call.** Callers are told they are speaking to an AI before anything substantive is said. The wording is fixed and the business cannot edit it.
- **Recording is your call.** Turn it off, or leave the `R2_*` variables unset, and nothing is stored. The disclosure stops claiming otherwise either way, and each call records which wording it played.
- **A name on every booking.** The agent asks who is coming when it books, never while a caller is only asking a question. The name lands on the calendar entry, the appointment and the caller's record for next time.
- **An escalation loop.** Questions the agent could not answer queue for you; the answer you give populates the knowledge base.
- **Recordings with transcript and summary.** A recorded call keeps its audio alongside the full transcript and an AI-written summary. The transcript and summary are kept whether or not the audio is.
- **Test your agent from the browser.** Talk to it live from the dashboard with no phone call. Nothing is recorded and no call is logged, but booking is real: a test session writes a genuine appointment and calendar event.
- **An admin dashboard.** The call log, a queue for answering escalations, a day-by-day view of what is booked, the knowledge base, and settings.
- **More than one business per install.** Every table carries an agent id, so a second business, a second location or a second line is simply another row.

## Screenshots

**Home** — how the phone did this month, and every call it took.
<img src="screenshots/dashboard.png" alt="Home - call stats and recent call history" width="780">

**A call** — what it was about in one line, then the whole transcript.
<img src="screenshots/call-details.png" alt="A call - summary and full transcript" width="780">

**Escalations** — what your agent could not answer. Answer it once, and it never has to ask again.
<img src="screenshots/escalation.png" alt="Escalations - questions the agent could not answer" width="780">

**Appointments** — a week strip that filters down to a single day.
<img src="screenshots/appointments.png" alt="Appointments - a week of bookings, filtered to a day" width="780">

**Knowledge** — search across the question-and-answer pairs the agent can handle on its own.
<img src="screenshots/knowledge.png" alt="Knowledge - searchable question and answer pairs" width="780">

**Settings** — one row per setting, with what it does on the left and the control on the right.
<img src="screenshots/settings.png" alt="Settings - services, phone number and Google Calendar" width="780">

## Tech stack

| Layer | Technology |
|---|---|
| API server | Hono (Node.js, ESM), typed end to end with the Hono RPC client |
| Database | Postgres 17 + Drizzle ORM |
| Auth | Clerk |
| Voice pipeline | LiveKit Agents SDK |
| STT | AssemblyAI universal-3-5-pro (LiveKit Inference) |
| LLM | LiveKit Inference by default; OpenRouter via `LLM_PROVIDER` |
| TTS | Cartesia Sonic 3.5 (LiveKit Inference) |
| Noise cancellation | Krisp telephony model, SIP calls only |
| Turn detection | LiveKit audio turn detector (`inference.TurnDetector`) |
| Telephony | LiveKit Phone Numbers |
| Calendar | Google Calendar API |
| Recordings | Cloudflare R2 |
| Frontend | React 19 + Vite + TypeScript |
| Validation and types | Zod schemas in `packages/shared`, shared by every package and the browser |
| UI | Tailwind v4 + shadcn/ui on Base UI primitives |
| Design tokens | A warm LCH ladder from one anchor and a contrast dial, with laws and contrast floors enforced by test |
| Data fetching | TanStack Query v5 |
| Tests | Vitest + Docker `postgres:17-alpine` |

## Getting started

### Prerequisites

- Node.js 22+
- A [LiveKit Cloud](https://cloud.livekit.io) project with a US phone number purchased and a SIP dispatch rule configured
- A [Clerk](https://clerk.com) application with Google OAuth enabled
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket, only if you want call recordings
- An [OpenRouter](https://openrouter.ai) API key, only when `LLM_PROVIDER=openrouter`
- [Docker](https://www.docker.com), for the development and test databases

### Install

```bash
git clone https://github.com/PrabhatMattoo/DeskRoute.git
cd DeskRoute
pnpm install
```

This is a pnpm workspace. Three processes run the product — `apps/api`, `apps/voice` and `apps/web`. `packages/core` holds the database, repositories, providers and domain logic they share, and `packages/shared` holds the Zod schemas every package validates and types against, the browser included.

### Environment

Each package ships an `.env.example` beside it. Copy each to `.env` and fill it in.

**`apps/api/.env`** and **`apps/voice/.env`** share the first block:

```env
DATABASE_URL=                  # postgresql://deskroute:deskroute@localhost:5432/deskroute
LIVEKIT_URL=                   # wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
CLERK_SECRET_KEY=

# Recording storage. Set all four, or none to run without recording.
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

**`apps/api/.env`** adds:

```env
PORT=8080
CLERK_PUBLISHABLE_KEY=
DASHBOARD_ORIGINS=             # comma-separated; defaults to http://localhost:5173
                               # any localhost port is accepted when a localhost origin is listed
```

**`apps/voice/.env`** adds:

```env
LLM_PROVIDER=                  # "livekit" (default) or "openrouter"
LLM_MODEL=                     # id in the selected provider's format, e.g. google/gemini-3.5-flash
SUMMARY_LLM_MODEL=             # model for post-call summaries (can match LLM_MODEL)
OPENROUTER_API_KEY=            # required when LLM_PROVIDER=openrouter
OPENROUTER_BASE_URL=           # https://openrouter.ai/api/v1
```

**`packages/core/.env`** holds `DATABASE_URL` alone, for `drizzle-kit`.

**`apps/web/.env`**:

```env
VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_URL=http://localhost:8080/api
```

### Database

```bash
docker compose up -d   # dev Postgres on 5432
pnpm db:migrate        # apply the migration chain to DATABASE_URL
```

`pnpm db:generate` writes a new migration from schema changes.

### Run

```bash
pnpm dev            # runs all three below at once via concurrently

# …or run them in separate terminals:
pnpm dev:api        # API server → http://localhost:8080
pnpm dev:voice      # LiveKit worker — keep running alongside the API
pnpm dev:web        # Admin dashboard → http://localhost:5173
```

## Versioning

`major.minor.patch`, tracked in the root `package.json`. Currently **1.0.23**.

## License

[AGPL-3.0](LICENSE) © 2026 Prabhat Mattoo

Self-host it freely. If you run a modified version as a network service, section 13 requires that its users can obtain the source of your changes. The dashboard carries a Source link in its sidebar footer for exactly that; point it at your own fork if you modify it.
