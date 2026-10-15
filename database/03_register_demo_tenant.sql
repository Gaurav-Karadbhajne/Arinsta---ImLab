-- Run in imlab_master AFTER creating imlab_t_citydiag and running 02_tenant_baseline.sql in it.
USE imlab_master;
-- host may include a port ("localhost:3307" for this machine's portable MySQL; omit for 3306).
INSERT INTO db_servers (host, max_tenants, tenant_count) VALUES ('localhost:3307', 100, 1);
-- db_password_enc: use 'plain:<password>' for local development only.
-- For real use run:  dotnet run --project src/ImLab.Web -- encrypt "<password>"  and paste the output.
-- Local dev credentials match appsettings.Development.json (MySQL on port 3307).
INSERT INTO tenants (company_id, company_name, db_server_id, db_name, db_user, db_password_enc)
VALUES ('CITYDIAG', 'City Diagnostics', 1, 'imlab_t_citydiag', 'imlab', 'plain:imlab_dev_pw');
