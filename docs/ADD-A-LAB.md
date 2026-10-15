# Add a new lab (tenant) — step-by-step runbook

One lab = **three things**: a row in `imlab_master.tenants`, its own database, its own MySQL user.
About 5 minutes by hand. Everything below uses client `100001` (GreenLife Diagnostics) as the example — replace number and name.

> This manual runbook is the **spec for the future provisioning module** (FRS platform admin):
> each step becomes one automated action. Run it by hand once (it is exercise E1 in
> `docs/LEARNING-PLAN.md`) and you will know exactly what that module must do.

MySQL client on this machine: `C:\Users\kp\tools\mysql8\bin\mysql.exe`.
In dev, `root` has no password on port 3307. The `imlab` user can do most of this, but **not the `GRANT` in
step 1** — granting privileges requires an account with `WITH GRANT OPTION`, which `imlab` intentionally lacks.

## Step 0 — choose the identifiers

| Thing | Example | Rules |
|---|---|---|
| Company ID | `100001` | **Numeric and unique** — what the client types at login (unique key `ux_tenants_company`) |
| Client name | `GreenLife Diagnostics` | Human-readable — goes into `company_name` |
| Database name | `imlab_t_greenlife` | Convention: `imlab_t_<lowercase slug>` |
| Database user | `imlab_t_greenlife` | Production: one MySQL user per lab (least privilege) |
| Database password | (generate one) | Goes into the master DB encrypted (step 3) |

Take the next free Company ID (the first one is 100001, then 100002, …):

```sql
SELECT COALESCE(MAX(CAST(company_id AS UNSIGNED)), 100000) + 1 AS next_company_id
FROM imlab_master.tenants WHERE company_id REGEXP '^[0-9]+$';
```

The demo lab `CITYDIAG` keeps its text ID (created before this rule); every new lab uses a number.

## Step 1 — create the lab's database and its MySQL user

```sql
CREATE DATABASE imlab_t_greenlife CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'imlab_t_greenlife'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON imlab_t_greenlife.* TO 'imlab_t_greenlife'@'localhost';
```

Why only four privileges: the app never creates tables (EF does not migrate; **you** own all DDL).
If one lab's DB user leaks, the damage is limited to that lab's rows — not the whole server.

Run this step as `root`. If the `GRANT` fails with **`#1044 Access denied … to database`**, the account you
ran it as lacks `WITH GRANT OPTION` — being allowed to `CREATE USER` is a separate right from being allowed
to grant privileges. Production: provisioning runs as the server admin account.

```bat
mysql.exe -h 127.0.0.1 -P 3307 -u root
```

## Step 2 — load the baseline schema and seed into the new database

Run this **as an admin user** (root or `imlab`), not as the restricted lab user: the baseline does
`CREATE TABLE config LIKE imlab_master.config`, which needs read access to the master database.

```bat
C:\Users\kp\tools\mysql8\bin\mysql.exe -h 127.0.0.1 -P 3307 -u root imlab_t_greenlife < database\02_tenant_baseline.sql
```

What every new lab starts with: the standard first login — username **`Admin`**, password **`Imlab@123`** —
plus a Main Branch center, 4 roles with permissions, 4 departments, 7 tests, 3 outsource labs, and empty
number series (lab numbers start at 2610001 — each lab has its own number space, that is by design).

Check it:

```sql
SELECT COUNT(*) AS tests FROM imlab_t_greenlife.tests;       -- 7
SELECT COUNT(*) AS depts FROM imlab_t_greenlife.departments; -- 4
```

## Step 3 — protect the database password

The master DB stores the lab's DB password AES-GCM-encrypted. Generate the value:

```bat
dotnet run --project src\ImLab.Web -- encrypt "choose-a-strong-password"
```

Copy the printed value (a plain base64 string of about 50–60 characters — it does **not** start with
`v1.`; that prefix belongs to password *hashes* from step 5). Development-only shortcut: `plain:<password>` works
because `AllowPlainSecrets` is on and the environment is Development — **never do that in production**
(the string would be readable by anyone with DB access).

## Step 4 — register the lab in the master database

```sql
USE imlab_master;

INSERT INTO tenants (company_id, company_name, db_server_id, db_name, db_user, db_password_enc, status, plan_id)
VALUES ('100001', 'GreenLife Diagnostics', 1, 'imlab_t_greenlife', 'imlab_t_greenlife', '<paste the encrypt output>', 'active', NULL);

-- Keep the counter honest (it is informational today; the provisioning job will enforce it)
UPDATE db_servers SET tenant_count = tenant_count + 1 WHERE id = 1;
```

Notes:
- `db_server_id = 1` is this machine's server row (`host = 'localhost:3307'`). For a new physical
  server, first `INSERT INTO db_servers (host, max_tenants) VALUES ('new-host:3306', 100);` — the
  host may include the port.
- `status = 'active'` is mandatory: the login query only finds active labs (other values:
  `suspended`, `archived`).
- `plan_id` stays NULL until the plans table gets real rows.

## Step 5 — set the lab's own admin password (recommended before handover)

Every lab is seeded with the standard first login **`Admin` / `Imlab@123`**. Before handing a lab to a
real client, give it its own password:

```bat
dotnet run --project src\ImLab.Web -- hash "TheLabsOwnPassword"
```

```sql
UPDATE imlab_t_greenlife.users SET password_hash = '<paste the hash output>' WHERE username = 'Admin';
```

(Until a change-password screen exists — a Phase 1 feature — this is the only way to set it.)

## Step 6 — first login and smoke test

1. Open the client (http://localhost:4200), sign in with **Company ID `100001`**, username `Admin`, the
   password from step 5 (or the standard `Imlab@123` if you skipped it). An empty dashboard is
   **correct** — the lab is fresh; isolation means no other lab's data is visible.
2. Register one test booking. The lab number must be **2610001** (fresh number series).
3. Prove the isolation:

```sql
SELECT COUNT(*) AS greenlife_bookings FROM imlab_t_greenlife.bookings;  -- 1
SELECT COUNT(*) AS citydiag_bookings  FROM imlab_t_citydiag.bookings;   -- still 2, unchanged
```

## Step 7 — suspending (instead of deleting) a lab

```sql
UPDATE imlab_master.tenants SET status = 'suspended' WHERE company_id = '100001';
```

Requests then fail (the tenant can no longer be resolved) and **no data is touched** — this is the
correct "offboarding" path; never DROP a lab's database on a payment dispute. Back to `'active'`
to restore. Takes effect after the tenant cache expires (≤ 5 minutes in dev without Redis).

## What is still manual (and becomes the provisioning module)

Every step above maps to a future automated action: create DB + user (1–2), load baseline (2),
encrypt password (3), insert tenant + counter (4), set admin password (5), welcome user (6),
suspend/restore (7). Not built yet, on purpose: a **migration runner** (runs each new
`database/0x_tenant_migration*.sql` on all labs), enforcement of `max_tenants` / `is_open` /
`tenant_count`, onboarding UI, and password-reset flow. Until then: this runbook, and add the new
lab to `database/` as a numbered script so it is replayable.
