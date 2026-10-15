# 2026-10-14 — Phase 0: full stack up, first booking end-to-end

## What I did
- Brought up MySQL 8.0.46 (portable, port 3307) + master and tenant databases, API on 5000, Angular on 4200.
- Fixed the first real bug: tenant connection ignored the port in `db_servers.host` — every tenant query
  silently hit the wrong MySQL (port 3306, the legacy product's server). Fix in
  `src/ImLab.Models/Data/TenantDbContext.cs` (`SplitHostPort`) + `database/03_register_demo_tenant.sql`.
- Registered a demo patient with a partial payment in the browser: CBC ₹300, paid ₹200.
- Verified the whole chain in the database: patient `P26-000001`, booking lab no `2610001`, bill `B26000001`,
  balance `100.00`, all three number series advanced.

## Insight of the day
The lab number didn't come from `SELECT MAX(lab_no)+1`. It came from one statement that reads and writes
atomically: `UPDATE number_series SET current_no = LAST_INSERT_ID(current_no + 1)`. That's why two
receptionists clicking Register in the same millisecond can never get the same number — MySQL serializes
the row update itself, and `LAST_INSERT_ID()` gives each connection *its own* new value. Teaching point for
exercise E4.

## I can now explain without notes
- Tenant resolution: Company ID → `imlab_master.tenants` → encrypted DB password → per-lab `TenantDbContext`.
- Why Referral doctor was blocking registration: a config row (`registration.referral_mandatory = true`)
  adds the `Validators.required` rule at runtime — validation lives in the config table, not in code.
- Why the dashboard cards showed 0 while the API was correct: the KPI count-up uses
  `requestAnimationFrame`, which is suspended in a hidden browser pane — a testing artifact, not a bug.

## Still fuzzy — next actions
- Client-side `ConfigService` (ETag handling) — read `client/src/app/core/config.service.ts`, then do E2.
- How JWT signature verification actually happens on each request — do E3 (decode + tamper test).

## Quiz for future me
1. Which single SQL statement generates the lab number, and why can't two connections get the same one?
2. Where does the server find the lab's database name at request time — and what stops a browser from
   asking for someone else's lab?
3. A config value changed in SQL doesn't appear on the registration form for 10 minutes. Which file, which
   line, and why is that acceptable at 500 labs?
