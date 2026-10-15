# ImLab — local development setup (this machine)

## What runs where

| Piece | Location | Port |
|---|---|---|
| MySQL 8.0.46 (new, for ImLab) | `C:\Users\kp\tools\mysql8` (portable) | **3307** |
| Old XAMPP MariaDB (eazylab product) | `D:\eazylab_pathology\xampp` | 3306 (untouched) |
| ImLab API (.NET 8) | `src/ImLab.Web` | **5000** |
| Angular client | `client/` | **4200** (proxies `/api` → 5000) |

Two separate database engines on purpose: ImLab devs against the real MySQL 8 production target; the old eazylab app keeps its MariaDB on 3306.

## Daily workflow

1. Start the database: double-click `infra\mysql\start-mysql.bat` (a minimized mysqld window appears). Stop it with `infra\mysql\stop-mysql.bat`.
2. Start the API: in `D:\ImLab` run `dotnet run --project src\ImLab.Web` → http://localhost:5000 (Swagger not mounted; endpoints under `/api/v1`).
3. Start the client: `cd client` then `npm start` → open http://localhost:4200
4. Sign in: Company ID `CITYDIAG`, username `admin`, password `Admin@123` (change it after first login).

## Run it from VS Code

The repo ships `.vscode/` tasks and launch configs, so no terminals needed.

1. Open the folder `D:\ImLab` in VS Code, **Trust** the workspace when asked (tasks/debugger need it).
2. Install the recommended extensions when the popup appears (C# Dev Kit, Angular Language Service, SQLTools ×2 for browsing the database — see "See the data" below).
3. **F5** → pick **Full stack (API + Chrome)**: starts MySQL if needed, builds and starts the API
   (5000), starts `ng serve` (4200), opens Chrome on the client. Breakpoints work anywhere under `src/`.
4. Prefer tasks (View → Command Palette → **Tasks: Run Task**):
   `dev: full stack` (all three), or individually `mysql: start`, `api: run`, `client: serve`, `tests: run`.
   `Ctrl+Shift+B` = build the API.
5. First-time gotcha: if the terminal says `dotnet` or `npm` is not recognized, VS Code was open
   before those tools were installed — fully close and reopen it so it picks up the new PATH.

Troubleshooting the VS Code run:

| Symptom | Fix |
|---|---|
| Banner says "Restricted Mode" | Trust the workspace (tasks and the debugger are disabled otherwise) |
| `npm.ps1 cannot be loaded because running scripts is disabled` | PowerShell blocks npm's script wrapper. Permanent fix: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (user-only, no admin) then reopen the terminal; quick fix: run `npm.cmd start` (the batch wrapper is never blocked) |
| F5 error `preLaunchTask "api: build" terminated with exit code 1` | A real build error — read the build terminal / Problems panel |
| `Port 5000/4200 already in use` | An older instance is still running: close its terminal in VS Code, or stop the external process |
| Chrome does not open, or no prompt | Open http://localhost:4200 manually; the API+client keep running either way |
| Firewall prompt on first API run | Allow (private networks) |
| Stop everything | `Shift+F5` stops the API debugger; click the trash icon on each task terminal; MySQL keeps running until `stop-mysql.bat` |

## See the data (browse the databases in VS Code)

Two databases to explore: `imlab_master` (tenant registry) and `imlab_t_citydiag` (the demo lab's own data).

**Option A — SQLTools extension (recommended, queries run from the editor)**

1. Extensions panel (`Ctrl+Shift+X`) → install **SQLTools**, then **SQLTools MySQL/MariaDB** (both are in the recommended list, so the popup may offer them).
2. The two connections are already pre-configured in `.vscode/settings.json`:
   - *ImLab master (3307)* → `imlab_master`
   - *ImLab tenant CITYDIAG (3307)* → `imlab_t_citydiag` (as `imlab` / `imlab_dev_pw`)
3. Open the SQLTools panel: database icon in the Activity Bar (or `Ctrl+Shift+P` → "SQLTools: Focus on Connections View").
4. Expand a connection → **Connect** → expand **Tables** → right-click a table → **Show Table Records** (or Select Top 1000).
5. Ad-hoc queries: create `scratch.sql`, type the query, put the cursor in it, press **`Ctrl+E Ctrl+E`** (execute). The first run asks which connection to use; results open in a grid.

```sql
-- in the master connection: which labs exist?
SELECT company_id, company_name, db_name, status FROM tenants;

-- in the tenant connection: bookings + patient per row
SELECT b.id, b.lab_no, b.bill_no, p.uid, p.first_name, b.total, b.paid
FROM bookings b JOIN patients p ON p.id = b.patient_id ORDER BY b.id DESC;

SELECT * FROM number_series;   -- lab_no / bill_no / patient_uid counters
```

**Option B — the mysql CLI** (no extensions)

```powershell
& "C:\Users\kp\tools\mysql8\bin\mysql.exe" -h 127.0.0.1 -P 3307 -u root
# press Enter at the password prompt (root has no password in dev)
```

```sql
SHOW DATABASES;
USE imlab_t_citydiag;
SHOW TABLES;
SELECT * FROM bookings;
```

**Option C — MySQL Workbench** (heavier GUI): new connection, host `127.0.0.1`, port `3307`.

Watching the data after a change is the fastest way to learn the schema: register a booking in the browser, then re-run the join query above and see the rows appear. This is also the tool for exercises E2 (flip a config value by SQL) and E5 (`EXPLAIN` with `ix_booking_center_id`) in `docs/LEARNING-PLAN.md`.

## Credentials (development only — never reuse in production)

- MySQL on port 3307: `root` (no password, admin only) and app user `imlab` / `imlab_dev_pw`
- New labs follow one standard: numeric Company ID (first `100001`) and first login `Admin` / `Imlab@123` — change per lab before handing over (`docs/ADD-A-LAB.md`)
- JWT key and AES secret: `src/ImLab.Web/appsettings.Development.json` (generated locally)
- Demo tenant registration: `database/03_register_demo_tenant.sql` (uses `plain:` password — allowed only in Development; production must use the `encrypt` command in the README)

## Provisioning / resetting the databases

Scripts live in `database/`. To reset from scratch:

```bat
mysql -h 127.0.0.1 -P 3307 -u root -e "DROP DATABASE IF EXISTS imlab_master; DROP DATABASE IF EXISTS imlab_t_citydiag;"
mysql -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE imlab_master CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE imlab_t_citydiag CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

then run `01_master.sql` (into imlab_master), `02_tenant_baseline.sql` (into imlab_t_citydiag), `03_register_demo_tenant.sql` (into imlab_master). The `mysql.exe` client is at `C:\Users\kp\tools\mysql8\bin\mysql.exe`.

To add a **new lab**, follow `docs/ADD-A-LAB.md` step by step (database + user → baseline → encrypted
password → master registration → first login).

## Project map (learning guide)

| Path | What it teaches |
|---|---|
| `database/*.sql` | Master vs tenant schema, config table design, seeded defaults |
| `src/ImLab.Models/Data` | EF Core, per-tenant DbContext, snake_case mapping, tenant context |
| `src/ImLab.Models/Repositories` | Tenant lookup cache (memory → Redis → master DB), keyset paging, atomic number series |
| `src/ImLab.Models/Services` | JWT, password hashing, AES secret protection, config resolver, booking/dashboard logic |
| `src/ImLab.Web/Program.cs` | Middleware pipeline order, DI lifetimes, rate limiting, auth setup |
| `src/ImLab.Web/Middleware` | Tenant resolution from the signed token |
| `src/ImLab.Web/Controllers` | Thin controllers, permission filter, ETag config endpoint |
| `client/src/app` | Angular routing/lazy loading, guards, interceptor, services, feature screens |

## Notes

- `dotnet` (`C:\Program Files\dotnet`) and Node/npm (`C:\Program Files\nodejs`) are on the machine
  PATH — fresh terminals and VS Code find them. A shell that cannot find them was started before the
  install; reopen it.
- No Docker on this machine; deployment (Phase 9/10) will need a container or service-host decision later.
