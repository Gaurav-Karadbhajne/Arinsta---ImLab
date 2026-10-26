-- Baseline schema for ONE lab. Run it inside the lab's own database (for example imlab_t_citydiag).
-- Create the database first:  CREATE DATABASE imlab_t_citydiag CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE config LIKE imlab_master.config;   -- same single config table (tenant scope)

CREATE TABLE centers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL, center_type VARCHAR(20) NOT NULL DEFAULT 'main',
  code VARCHAR(20) NOT NULL, address VARCHAR(300) NULL, mobile VARCHAR(20) NULL, email VARCHAR(120) NULL,
  is_active BOOL NOT NULL DEFAULT 1, is_deleted BOOL NOT NULL DEFAULT 0
);
CREATE TABLE roles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(60) NOT NULL, code VARCHAR(30) NOT NULL,
  landing VARCHAR(30) NOT NULL DEFAULT 'dashboard', max_discount_percent DECIMAL(5,2) NULL, is_deleted BOOL NOT NULL DEFAULT 0
);
CREATE TABLE role_permissions (
  role_id BIGINT NOT NULL, perm_key VARCHAR(60) NOT NULL, PRIMARY KEY (role_id, perm_key)
);
CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  center_id BIGINT NOT NULL, role_id BIGINT NOT NULL,
  username VARCHAR(60) NOT NULL, full_name VARCHAR(120) NOT NULL, password_hash VARCHAR(200) NOT NULL,
  mobile VARCHAR(20) NULL, email VARCHAR(120) NULL,
  is_active BOOL NOT NULL DEFAULT 1, failed_attempts INT NOT NULL DEFAULT 0, locked_until DATETIME NULL, is_deleted BOOL NOT NULL DEFAULT 0,
  UNIQUE KEY ux_users_username (username)
);
CREATE TABLE departments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, code VARCHAR(20) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0, is_active BOOL NOT NULL DEFAULT 1
);
CREATE TABLE tests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, department_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL, short_name VARCHAR(30) NOT NULL, price DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0, is_active BOOL NOT NULL DEFAULT 1,
  KEY ix_tests_dept (department_id)
);
CREATE TABLE outsource_labs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, is_active BOOL NOT NULL DEFAULT 1
);
CREATE TABLE patients (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, uid VARCHAR(30) NOT NULL,
  title VARCHAR(10) NULL, first_name VARCHAR(80) NOT NULL, last_name VARCHAR(80) NULL,
  gender VARCHAR(10) NOT NULL, age_years INT NOT NULL DEFAULT 0, mobile VARCHAR(20) NULL, email VARCHAR(120) NULL,
  address VARCHAR(300) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_patient_uid (uid), KEY ix_patient_mobile (mobile), KEY ix_patient_name (last_name, first_name)
);
CREATE TABLE bookings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, lab_no BIGINT NOT NULL, bill_no VARCHAR(30) NOT NULL,
  patient_id BIGINT NOT NULL, center_id BIGINT NOT NULL, referral_doctor VARCHAR(120) NULL, corporate VARCHAR(120) NULL,
  booked_at DATETIME NOT NULL, total DECIMAL(12,2) NOT NULL, discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid DECIMAL(12,2) NOT NULL DEFAULT 0, payment_mode VARCHAR(20) NOT NULL DEFAULT 'Cash',
  created_by BIGINT NOT NULL, is_deleted BOOL NOT NULL DEFAULT 0,
  UNIQUE KEY ux_booking_labno (lab_no), KEY ix_booking_center_id (center_id, id DESC), KEY ix_booking_date (booked_at), KEY ix_booking_patient (patient_id)
);
CREATE TABLE booking_tests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, booking_id BIGINT NOT NULL, test_id BIGINT NOT NULL, department_id BIGINT NOT NULL,
  price DECIMAL(12,2) NOT NULL, status TINYINT NOT NULL DEFAULT 0, booked_at DATETIME NOT NULL,
  is_outsource BOOL NOT NULL DEFAULT 0, outsource_lab_id BIGINT NULL, outsource_status TINYINT NOT NULL DEFAULT 0,
  KEY ix_bt_booking (booking_id), KEY ix_bt_worklist (status, department_id, booked_at), KEY ix_bt_outsource (is_outsource, outsource_status)
);
CREATE TABLE booking_payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, booking_id BIGINT NOT NULL, amount DECIMAL(12,2) NOT NULL,
  mode VARCHAR(20) NOT NULL, kind VARCHAR(10) NOT NULL DEFAULT 'payment', paid_at DATETIME NOT NULL, received_by BIGINT NOT NULL,
  KEY ix_pay_booking (booking_id)
);
CREATE TABLE number_series (
  series_key VARCHAR(30) PRIMARY KEY, current_no BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE daily_summary (
  center_id BIGINT NOT NULL, summary_date DATE NOT NULL,
  bookings INT NOT NULL DEFAULT 0, delivered INT NOT NULL DEFAULT 0,
  revenue DECIMAL(14,2) NOT NULL DEFAULT 0, outstanding DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (center_id, summary_date)
);
CREATE TABLE audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NULL, action VARCHAR(40) NOT NULL, entity VARCHAR(60) NOT NULL,
  entity_id VARCHAR(40) NULL, detail TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_audit_time (created_at)
);

-- Seed data every new lab starts with
INSERT INTO number_series (series_key, current_no) VALUES ('lab_no', 2610000), ('bill_no', 0), ('patient_uid', 0);
INSERT INTO centers (name, center_type, code) VALUES ('Main Branch', 'main', 'MAIN');
INSERT INTO roles (id, name, code, landing, max_discount_percent) VALUES
 (1,'Admin','admin','dashboard',NULL),(2,'Front Office','FO','registration',10),(3,'Technician','TECH','result',0),(4,'Consultant Pathologist','CP','result',0);
-- Permissions per role. Admin(1) gets everything; other roles can view masters but not change them.
-- Keys must match Perm constants in Abstractions.cs — keep the two in sync when adding endpoints.
INSERT INTO role_permissions (role_id, perm_key) VALUES
 (1,'dashboard.view'),(1,'booking.view'),(1,'booking.create'),(1,'outsource.view'),(1,'config.view'),(1,'config.edit'),(1,'master.view'),(1,'master.manage'),
 (2,'dashboard.view'),(2,'booking.view'),(2,'booking.create'),(2,'outsource.view'),(2,'master.view'),
 (3,'dashboard.view'),(3,'booking.view'),(3,'master.view'),
 (4,'dashboard.view'),(4,'booking.view'),(4,'master.view');
-- Standard first login for every lab: username Admin, password Imlab@123  (change before handover)
INSERT INTO users (center_id, role_id, username, full_name, password_hash) VALUES
 (1, 1, 'Admin', 'Administrator', 'v1.100000.V54+KeguXy6BgU7Nm8k3jw==.cdyyY4C/cEfLeHbVK68DE1wl13LKurikRZvi3XWQ3tQ=');
INSERT INTO departments (name, code, sort_order) VALUES ('Haematology','HAE',1),('Biochemistry','BIO',2),('Microbiology','MIC',3),('Immunoassay','IMM',4);
INSERT INTO tests (department_id, name, short_name, price, sort_order) VALUES
 (1,'Complete blood count','CBC',300,1),(2,'Lipid profile','LIPID',500,2),(2,'Blood sugar fasting','FBS',50,3),
 (2,'Kidney function test','KFT',800,4),(4,'Thyroid profile','TFT',650,5),(4,'Vitamin D','VITD',900,6),(3,'Pus culture','PUS',350,7);
INSERT INTO outsource_labs (name) VALUES ('Metropolis'),('SRL Diagnostics'),('Thyrocare');
-- Tenant-level config rows start empty: values fall back to platform defaults from imlab_master.config

