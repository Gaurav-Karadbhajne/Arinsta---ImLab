# ImLab starter solution

ASP.NET Core MVC backend, Angular client, MySQL. One database per lab, found from the Company ID typed at login.
Built from the ImLab SRS and FRS (sections 12, 13, 20 to 22).

> New here? Read `docs/DEV-SETUP.md` for the local workflow and `docs/LEARNING-PLAN.md` for the
> learn-while-building plan: weekly dissection exercises, the responsive-device rules, and the
> 500-lab performance checklist. Progress journal lives in `docs/learning-log/`.

> This code was written without a .NET SDK or internet access, so it has **not been compiled or run**.
> Expect a few small compile fixes on the first build. It targets .NET 8; to move to .NET 10, change `TargetFramework`
> and the package versions in the three `.csproj` files.

## What is inside

| Folder | Contents |
|---|---|
| `database/01_master.sql` | Parent database: `db_servers`, `plans`, `tenants`, the single `config` table, `migration_history`, platform defaults |
| `database/02_tenant_baseline.sql` | Schema and seed data for one lab (run inside the lab's own database) |
| `database/03_register_demo_tenant.sql` | Registers the demo lab `CITYDIAG` in the parent database |
| `src/ImLab.Models` | M of MVC: entities, enums, DbContexts, repositories, services, view models, validators |
| `src/ImLab.Web` | C and V of MVC: thin controllers, filters, tenant middleware, Razor receipt view, static Angular files |
| `src/ImLab.Tests` | Unit tests for billing totals, password hashing and secret protection |
| `client` | Angular app: login (Company ID, Username, Password), dashboard with animated charts, Patient tabs (Registration, Search, Outsource Test) |

## Run it

1. Install .NET 8 SDK, Node 20 or newer and MySQL 8.
2. Create the parent database: run `database/01_master.sql`.
3. Create a lab database and load its schema:
   ```sql
   CREATE DATABASE imlab_t_citydiag CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   USE imlab_t_citydiag;
   -- then run database/02_tenant_baseline.sql
   ```
4. Edit `database/03_register_demo_tenant.sql` (replace `CHANGE_ME` with the MySQL password) and run it.
5. In `src/ImLab.Web/appsettings.json` set the master connection password, a long random `Jwt:Key`, and `Security:SecretKeyBase64`
   (32 random bytes, base64). `plain:` secrets work only in the Development environment.
6. Start the API: `dotnet run --project src/ImLab.Web --urls http://localhost:5000`
7. Start the client: `cd client && npm install && npm start`, then open http://localhost:4200
8. Sign in with Company ID `CITYDIAG`, username `admin`, password `Admin@123`, then change the password.

For production: `cd client && npm run build` writes the Angular app into `src/ImLab.Web/wwwroot`, and one .NET process serves both.

Encrypt a lab's database password for the `tenants` table:
`dotnet run --project src/ImLab.Web -- encrypt "the password"`

## How a request flows

Login: the API looks up the Company ID in `imlab_master.tenants` (memory cache, then Redis, then the database), opens that lab's
database, checks the user, and returns a token that carries the company ID. Every later request resolves the lab from the signed
token only, so the browser cannot pick another lab.

Request, tenant middleware, permission filter, validation filter, controller, service, repository, lab database, view model (JSON) or Razor view.

## Built for 500+ labs

- Connection pool per lab limited to 20, minimum 0, idle timeout 60 s (`TenantDbContext`)
- Two-level tenant lookup cache and per-lab dashboard and config caches with invalidation
- Per-lab rate limit (600 requests per minute, `appsettings.json`)
- Keyset paging, indexed search columns, no change tracking on reads
- Daily summary table updated inside the booking transaction; dashboard reads it
- Lab, UID and bill numbers from one atomic `UPDATE ... LAST_INSERT_ID()`
- Lazy-loaded Angular routes, OnPush components, debounced search
- Config endpoint with ETag; registration rules (mandatory fields) and theme colour read from the config table

## Not included yet

Results and authorization, masters, reports and exports, machine integration, signatures, the internal platform app,
the tenant provisioning job and migration runner, background queues, and the load test. They follow the FRS and the Module-wise Plan.
Before relying on the 500-lab target, run the load test described in SRS section 13 (SC-15).
