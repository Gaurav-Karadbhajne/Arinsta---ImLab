-- ImLab parent (master) database. Run once.
CREATE DATABASE IF NOT EXISTS imlab_master CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE imlab_master;

CREATE TABLE IF NOT EXISTS db_servers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  host VARCHAR(100) NOT NULL,
  max_tenants INT NOT NULL DEFAULT 100,
  tenant_count INT NOT NULL DEFAULT 0,
  is_open BOOL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  max_users INT NOT NULL DEFAULT 20,
  max_centers INT NOT NULL DEFAULT 5,
  max_bills_per_month INT NOT NULL DEFAULT 5000,
  is_active BOOL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id VARCHAR(30) NOT NULL,
  company_name VARCHAR(150) NOT NULL,
  db_server_id INT NOT NULL,
  db_name VARCHAR(80) NOT NULL,
  db_user VARCHAR(60) NOT NULL,
  db_password_enc VARCHAR(600) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'active',   -- active, suspended, archived
  plan_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_tenants_company (company_id),
  KEY ix_tenant_server (db_server_id),
  CONSTRAINT fk_tenant_server FOREIGN KEY (db_server_id) REFERENCES db_servers(id)
);

-- ONE config table: same structure in master (scope = platform) and in every tenant database
CREATE TABLE IF NOT EXISTS config (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  scope VARCHAR(10) NOT NULL DEFAULT 'platform',      -- platform, tenant, user
  scope_ref VARCHAR(64) NOT NULL DEFAULT '',
  group_code VARCHAR(60) NOT NULL,
  config_key VARCHAR(120) NOT NULL,
  config_value TEXT NULL,
  default_value TEXT NULL,
  data_type VARCHAR(10) NOT NULL DEFAULT 'string',    -- bool,int,decimal,string,json,color,date,list,secret
  ui_control VARCHAR(20) NOT NULL DEFAULT 'text',
  label VARCHAR(150) NOT NULL,
  description VARCHAR(300) NULL,
  is_tenant_editable BOOL NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOL NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_config (scope, scope_ref, group_code, config_key)
);

CREATE TABLE IF NOT EXISTS migration_history (
  tenant_id BIGINT NOT NULL,
  script VARCHAR(120) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, script)
);

-- Platform defaults every new lab inherits
INSERT INTO config (scope, scope_ref, group_code, config_key, config_value, default_value, data_type, ui_control, label, sort_order) VALUES
('platform','','registration','last_name_mandatory','false','false','bool','toggle','Last name mandatory',1),
('platform','','registration','age_mandatory','true','true','bool','toggle','Age mandatory',2),
('platform','','registration','mobile_mandatory','false','false','bool','toggle','Mobile mandatory',3),
('platform','','registration','referral_mandatory','true','true','bool','toggle','Referral doctor mandatory',4),
('platform','','print','block_report_if_due','true','true','bool','toggle','Block report if balance due',1),
('platform','','theme','primary_color','#0E9F8E','#0E9F8E','color','color','Primary color',1),
('platform','','dashboard','cache_seconds','45','45','int','number','Dashboard cache seconds',1);
