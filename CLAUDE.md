# DeskRoute

Self-hosted, open-source AI receptionist. A customer calls a real number, LiveKit SIP routes it, the agent answers, escalates or books, and the owner sees it in the dashboard.

**`ARCHITECTURE.md` is the reference**: layout, processes, environment, schema, the call path, the dashboard's design system, and the reasoning behind every rule below. Read the relevant section before working in an area. This file is only the rules.

## Commands

```bash
pnpm dev             # api + voice + web together
pnpm dev:api         # API server  → http://localhost:8080
pnpm dev:voice       # LiveKit worker (separate process, keep alongside the API)
pnpm dev:web         # Admin dashboard → http://localhost:5173

pnpm typecheck       # tsc --noEmit across every package
pnpm lint            # eslint, apps/web
pnpm build           # build apps/web

pnpm db:generate     # migration from schema changes
pnpm db:migrate      # apply to whatever DATABASE_URL points at

docker compose up -d # dev Postgres on 5432, throwaway test Postgres on 5433
pnpm test            # unit + agent tests (no DB, no network)
pnpm test:int        # repository tests against the test Postgres
pnpm test:live       # real-credential tests; costs tokens, excluded from CI
pnpm test:web        # the design-token contract
```

Run `pnpm typecheck` and `pnpm lint` before calling any change done.

## Never do these

Each has a mechanism behind it, explained in ARCHITECTURE.md under Decisions.

- **Never let a turn both speak and call a tool.** `receptionist/speech-guard.ts` drops the speech, so a caller does not hear the model's private deliberation.
- **Never add a hold phrase or `ctx.filler`.** Speech is a queue, so it stands in front of the tool's answer and the real reply is discarded.
- **Never enable `preemptiveTts`.** Preemptive generation stays on; preemptive TTS sends audio built from a guess that may be thrown away.
- **Never set `turnHandling.turnDetection`.** Leaving it undefined is what auto-provisions the streaming turn detector and lowers the endpointing floor.
- **Never call `RoomServiceClient.deleteRoom()`** to end a call. Use `ctx.session.shutdown({ drain: true })`.
- **Never create per-agent SIP dispatch rules.** One deployment-wide rule with an empty routing filter; the agent is resolved at runtime from `phone_numbers.e164`.
- **Never instantiate a model client outside `buildLLM()`** in `session/pipeline.ts`.
- **Never read `recordCalls` to decide anything.** `recordingEnabled()` in `providers/storage.ts` is the one value the disclosure and the egress call both read.
- **Never write a placeholder caller identity.** A withheld number stores no `callers` row.

## Backend

- **Modules** — one folder per resource under `apps/api/src/modules`, each exporting a chained `Hono` instance. Handlers sit on their routes: Hono cannot infer path parameters across a split, and `hc<AppRoutes>()` needs the chain. Parse input, call a repository, return a response. No try/catch; errors bubble to `onError` in `app.ts`.
- **Repositories** — the only code that touches Postgres. `providers/` reach outward, `domain/` stays pure.
- Every repository function takes `agentId` first, and the LLM never receives one.
- Use `AppEnv` from `apps/api/src/types.ts` so `c.get('agentId')` is typed.

## Frontend

- **A call site names a width; it does not measure one.** `w-field-sm` a time or a short code, `md` a name or a chosen option, `lg` a line of prose or a search; `max-w-page` / `max-w-form` / `max-w-narrow` for pages. A control that sizes to its own content owns that width itself, as `NumberField` does. `design-tokens.test.ts` fails on a pixel width under `features/` or `layout/`.
- **Nothing below 14px**, including arbitrary values like `text-[0.8rem]`.
- **A duration or a count is a `NumberField`.** Digits only, unit painted inside the box.
- **Colours come from the tokens in `index.css`**, never a hardcoded value.
- **Dates render in the agent's timezone** via `useAgentZone()` and the `timeZone` argument in `lib/formatters.ts`.
- **A settings row's description is one line.** If it needs two, the setting needs a better name.
- **No centred empty states on a list page.** Say it in one muted line where the rows would be.
- Retokenise anything `shadcn add` writes; a contract test scans for the utilities it ships that are inert here.

## Comments

Zero or one line, almost always. Two only when getting the thing wrong has a severe consequence. Nothing trivial gets a comment. Long-form reasoning goes in `ARCHITECTURE.md`, and no comment points at that file.

## Commits

Conventional Commits. Hyphen bullets, one per change, each opening with a capitalised imperative verb and naming the identifier it touched. No prose paragraphs, no em dashes, no attribution trailers of any kind. No line describes what is absent: state the edit, not the history. Commits are clubbed, not split.

## Verify UI work against the running app

Do not reason from the source about what the browser does. A single `getComputedStyle` call settles what an afternoon of reading the CSS will not. Run the app and measure.

One caveat: a Chrome tab that is not the foreground tab stops rendering. Animations do not advance, `requestAnimationFrame` never fires, and elements mid-transition stay in the DOM. Confirm `document.visibilityState === 'visible'` before trusting any timing measurement.

## Versioning

`major.minor.patch` in the root `package.json` only. One patch bump per commit that changes what a customer runs, in the same commit as the work. Docs, tests, tooling and comments do not bump.
