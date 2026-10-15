# ImLab learning plan

v1 — 2026-10-14. This document is for you (the developer): how to learn everything ImLab needs while
building it, and the engineering rules that keep it responsive, fast, and good for 500+ labs.

## 0. The situation, honestly

- You are strong in SQL/MySQL, new to C#/.NET and Angular, working 20–40 hrs/week, solo + AI.
- The spec docs (Module-wise Plan) budget ~252 person-weeks for a 6–7 person team. You are not going
  to reproduce that in one shot. The strategy is **MVP-first**: take the starter (already running),
  harden it, ship the core lab flow (register → collect → result → report), then add modules.
- Two hard requirements, treated as non-negotiable from day one:
  1. **Responsive on all devices** (phone, tablet, desktop).
  2. **500+ labs, no slowdown** — isolation, caching, indexed queries, bounded work per request.

## 1. The learning loop — every work session

For every piece of code that enters the repo, run this loop:

1. **Predict.** Before reading, guess what the file does from its name and how it fits.
2. **Read.** Read the actual code. Slow down on unfamiliar syntax; it is fine to ask AI line-by-line.
3. **Explain back.** Say out loud (or write in the learning log) what each part does, in your words.
   If you catch yourself saying "I think" — go back and read again.
4. **Break it.** Change one thing (a value, a flag, a query) and predict what will change. Run it. Were
   you right? Breaking things in dev is free; in production it is not.
5. **Log one insight.** One entry in `docs/learning-log/`. One insight, honestly written.

Rule: **never keep code you cannot explain.** AI can write the first draft; you own the understanding.
A file you cannot explain is a bug scheduled to happen when you least expect it.

## 2. Concept map — use your SQL strength as the anchor

| You already know (SQL) | In this codebase (C#/.NET) | In the client (Angular) |
|---|---|---|
| Table | Entity class — `src/ImLab.Models/Entities/Tenant/TenantEntities.cs` | Interface in `core/models.ts` |
| Row | Object of that class | Object from `HttpClient` JSON |
| `SELECT ... WHERE` | LINQ `.Where(...)` in repositories | `*ngIf` / `@if` in templates |
| `JOIN` | `.Join(...)` or navigation props (`b.Patient`) | — (server joins) |
| `INSERT` / `UPDATE` | `SaveChanges()` (EF tracks changes) | — |
| Stored procedure | Service method — `Services/BookingService.cs` | — |
| `BEGIN ... COMMIT` | `BeginTransactionAsync` — `Repositories/BookingRepository.cs:22` | — |
| `SHOW CREATE TABLE` | DbContext config — `Data/TenantDbContext.cs` | — |
| `EXPLAIN` | `.ToQueryString()` on an EF query to see the SQL | — |
| Index | Same — written by hand in `database/*.sql` | — |
| View | ViewModel / DTO — `ViewModels/ViewModels.cs` | `models.ts` + component signal |
| User/grant | JWT claims + permission filter | Route guard + `auth.interceptor.ts` |

Thinking in mappings like this is how the new stack becomes cheap to learn: almost everything is a
reframing of something you already do well.

## 3. Phase 0 dissection — exercises for this week

Everything you need is already running: MySQL on 3307, API on 5000, client on 4200 (see
`docs/DEV-SETUP.md`). Do these in order; each one has a "done when" you can verify.

**E1 — Register a second lab (SQL only).** Copy `database/03_register_demo_tenant.sql` to
`04_register_tenant2.sql`, change the company, create `imlab_t_citydiag2` + run
`02_tenant_baseline.sql` inside it, register the tenant row. Log in as the new lab in a second
browser profile. Register a booking there, then check: it must land in the *other* database.
Full step-by-step is in `docs/ADD-A-LAB.md` — do it by hand first, then read that runbook and find
any step you missed.
*Learn:* the provisioning model (this becomes an admin feature later). *Done when:* both labs log in
and have isolated data.

**E2 — Flip a config value, watch it take effect.** `registration.referral_mandatory` defaults to
`true` (platform row in `01_master.sql`), which is why the Register button refused to enable until
Referral doctor was filled. Try both paths:
- Direct SQL: insert a `config` row with scope `tenant` for CITYDIAG setting it to `false`.
  Reload the form. Note it takes up to 10 minutes — read `Services/ConfigService.cs:16` to see why
  (per-lab cache, 10 min TTL).
- API path: `PUT /api/v1/config` (see `Controllers.cs` — needs `config.edit` permission).
  Read `ConfigService.UpdateAsync`: the write invalidates the cache instantly.
*Learn:* scope resolution (tenant row beats platform default), `IsTenantEditable` locking, cache
invalidation on write. *Done when:* you can explain when the change appears, and why, in both paths.

**E3 — Decode the JWT.** Log in, copy the token from `sessionStorage` (`imlab.session`), paste it into
jwt.io. Find `sub`, `name`, `role`, `center`, `tid`, `cid`, `maxdisc`, `perm[]`. Match each claim to
`Services/JwtTokenService.cs`. Then tamper: change `center` in the payload, paste the modified token
into the Authorization header with curl. Expect 401 — the signature no longer matches.
*Learn:* stateless auth, why the browser cannot pick another lab. *Done when:* you can say which
claim drives tenant resolution and which drives discount limits.

**E4 — Walk `BookingService.CreateAsync` line by line.** (`Services/BookingService.cs:19`.)
Then answer, on paper: two receptionists click Register in the same millisecond — why do the two
bookings still get different lab numbers, and no row gets skipped? Compare with a naive
`SELECT MAX(lab_no) + 1`. Read `BookingRepository.NextNumberAsync` (line 32) and note the single
`UPDATE ... LAST_INSERT_ID()` statement does both read and write atomically.
*Learn:* transactions, race conditions, atomic counters — your SQL depth makes this one fast.
*Done when:* you can explain the two-receptionist scenario without looking.

**E5 — SQL session (your home turf, go deep).** `SHOW CREATE TABLE bookings;` → find
`ix_booking_center_id (center_id, id DESC)` and explain why it exists in that exact shape.
Then `EXPLAIN` the search query (hit the Search screen, read the SQL EF logs, or transcribe from
`BookingRepository.SearchAsync`). Verify the index is used. Then invent a query the indexes do NOT
cover and watch `type: ALL` appear. *Learn:* index design under real query patterns; keyset paging
vs `OFFSET`. *Done when:* you can predict index usage before running EXPLAIN.

**E6 — Vertical slice: add a patient Email field.**
- 6a (client only): `email` already flows through `BookingForm` (`BookingService.cs:45`); add the
  control + input in `client/src/app/features/patient/registration.component.ts` and see it saved.
- 6b (full stack): pick a new field (e.g. Aadhaar/ID number). `ALTER TABLE patients`, add the entity
  property, the VM property, the input, and check it in the DB.
*Learn:* the pattern for every future feature: DB → entity → repository/service → controller → VM →
client. *Done when:* a new field survives browser → API → MySQL → search screen.

**E7 — Watch lazy loading happen.** Open DevTools → Network → filter `.js`. Load the app, then
navigate Dashboard → Patient → Registration. Each route pulls its own chunk when first visited
(`client/src/app/app.routes.ts` — every entry uses `loadComponent`).
*Learn:* why the first screen is fast on a clinic's slow connection, and what NOT to add to the
initial bundle. *Done when:* you can name which chunk loads for which route.

## 4. Hard requirement 1 — responsive on all devices

What exists today: fluid grids (`repeat(auto-fit, minmax(...))`) in the patient screens, a
900 px collapse rule in `registration.component.ts:51`, signal-based OnPush components so
re-rendering is cheap.

Rules for every new screen and change:

1. **Design mobile-first**: lay out for 360 px, then let it grow. Never the reverse.
2. **Fluid grids, not fixed widths** — `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`
   is the house pattern.
3. **One breakpoint where the layout genuinely changes** (sidebar collapses, columns stack) — use
   ~900 px like the registration screen; do not sprinkle breakpoints.
4. **Touch targets ≥ 44 px** on phones; test button thumb-reach.
5. **Tables collapse into cards** on narrow screens (the search list pattern).
6. **Audit before marking a screen done**: DevTools device toolbar at 360 px, 768 px, 1280 px.
   Check: no horizontal scroll, no clipped buttons, bill summary reachable with one thumb.

Standing gap (deliberate, tracked): the shell sidebar's phone behavior and the search list need a
proper 360 px pass. Do it during the Phase 0→1 hardening week.

## 5. Hard requirement 2 — 500 labs without slowdown

The contract: 500 labs share one platform, and no lab can (a) see another's data, (b) meaningfully
slow another down. How the code does it today — each mechanism with its file:

| Mechanism | Where | Why it matters at 500 labs |
|---|---|---|
| Database per lab | `database/01_master.sql`, `TenantStore` | A hot lab locks its own tables; blast radius = one lab |
| Tenant lookup cache: memory 5 min → Redis 30 min → master DB | `Repositories/TenantStore.cs:33` | 500 logins/min don't hammer one shared table |
| Tenant connection pool: max 20, **min 0**, idle 60 s | `Data/TenantDbContext.cs` | Idle labs hold **zero** connections; the server sees only active labs |
| Redis already wired, optional | `Program.cs:28` | Add the connection string when you run more than one API instance |
| Config cached per lab, invalidated on write | `ConfigService.cs` | Config reads are free; writes are immediately visible |
| Catalog cached 10 min per lab | `BookingService.cs:13` | Test list served from memory |
| Dashboard from `daily_summary` rollup, written inside the booking transaction | `BookingRepository.UpsertSummaryAsync` | Dashboard = O(1) read, not a scan; stale-proof |
| Dash cache removed on booking | `BookingService.cs:76` | Fresh numbers right after a registration |
| Atomic number series (no table lock, no gaps) | `BookingRepository.NextNumberAsync:32` | 100 bookings/minute, zero duplicates |
| Keyset paging, never OFFSET | `BookingRepository.SearchAsync:74` | Page 1 and page 10,000 cost the same |
| Indexes for real queries | `database/02_tenant_baseline.sql` | e.g. `ix_booking_center_id (center_id, id DESC)` |
| NoTracking read paths | `TenantDbContext.OnConfiguring` | Reads don't pay for change tracking |
| Per-lab rate limit (600 rpm) | `Program.cs` rate limiter | One runaway client can't starve the platform |
| ETag on config, response compression | `ConfigController` | Bytes saved per request |
| Lazy routes, OnPush, signals, debounced search | `client/src/app/**` | Client stays fast on cheap hardware |

**The connection math you should be able to do.** MySQL `max_connections` (dev: 200) must cover
*concurrently active* requests, not tenant count. With min-pool 0 and 60 s idle timeout, idle labs
contribute nothing; at peak, live connections ≈ number of in-flight requests across all labs. Rule
of thumb to design for: if 5% of 500 labs are actively registering at once, each with 1–2 open
connections, you need a few hundred server connections — size `max_connections` to ~1000 on a real
server and verify with the SRS SC-15 load test. **Do not claim "500 labs" to anyone until that test
runs.** (README already says this — keep saying it.)

**Honest gaps / backlog** (turn into tasks when Phase 1 hardens): Redis in every environment,
per-plan pool caps, the load test, aggregating job for summaries beyond today, and `EXPLAIN` audits
on each new query.

**Performance checklist for every new feature** (paste into your PR/commit checklist):
1. Every new query hits an index — run `EXPLAIN`, or `.ToQueryString()` for EF.
2. No `OFFSET` paging; keyset or rollup only.
3. Per-screen read → cache it; every write that touches it → invalidate it.
4. Project only needed columns (`Select`), never a full entity graph for a list.
5. Work per request is bounded (Take/limit) — no unbounded `ToList()`.
6. Measure before claiming: `.ToQueryString()` or timing log while developing.

## 6. Realism: MVP-first against 252 person-weeks

- **Phase 0 (done)** — full stack running, tenant model proven, booking flow end-to-end.
- **Phase 1 hardening (1–2 weeks)** — learning exercises E1–E7, responsive audit, first tests, git
  history started. No new features.
- **MVP (est. 3–6 months at 20–40 h/week)** — the core revenue flow one lab actually needs daily:
  registration, billing/discounts (exists), results entry, report generation/print, user management.
  This is the first version you can put in front of a real lab.
- **Full FRS (est. 18–30 months solo+AI)** — all modules, platform admin, machine integration,
  scales. The team-sized plan did not disappear; AI compresses it, it does not delete it.
- Recalibrate from the learning log every month: what took longer than expected tells you where the
  next month goes.

## 7. Weekly rhythm (scale to your 20–40 h)

- ~20% reading & explaining (code, docs, these exercises)
- ~60% building features (with the learning loop)
- ~20% exercises + learning log + tests
- End-of-week: 1 feature merged · 1 exercise done · every AI-written diff that was kept can be
  explained without notes.

## 8. Working with AI without fooling yourself

- Good prompts: *"explain this file assuming I know SQL but no C#"* · *"quiz me on
  BookingService.cs"* · *"what input would break this?"* · *"show me the SQL EF generates for this
  query"* · *"what should I read before this makes sense?"*
- Banned pattern: *"looks fine, commit"*. If you can't explain it, it isn't done.
- AI writes code fast; debugging code you don't understand takes longer than writing it yourself.
  The explain-back habit is the difference between a codebase that compounds and one that collapses.

## 9. Where everything lives

| Path | What |
|---|---|
| `docs/DEV-SETUP.md` | Ports, daily start/stop, credentials, DB reset |
| `docs/LEARNING-PLAN.md` | This file |
| `docs/learning-log/` | Your journal; one file per session |
| `docs/specs/` | FRS, SRS, planning docs — the requirements source |
| `database/` | Schemas + seeds — **you** own all DDL; EF never migrates |
| `src/ImLab.Models/` | Entities, DbContexts, repositories, services (the brain) |
| `src/ImLab.Web/` | Controllers, middleware, Program.cs (the face) |
| `client/src/app/` | Angular app: `core/` (auth, http), `features/` (screens), `layout/` (shell) |

First-week checklist: [ ] E1 [ ] E2 [ ] E3 [ ] E4 [ ] E5 [ ] E6 [ ] E7 [ ] 360 px audit of all
four screens [ ] five learning-log entries [ ] git identity set + first commit.
