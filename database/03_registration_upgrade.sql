-- ============================================================================
-- Registration upgrade for one tenant DB (run once per lab database).
-- Adds: full age (Y/M/D), patient type, token no, remark/delivery mode,
--       referral doctors / hospitals / sample collectors masters,
--       packages, per-test sample type, line-level charge + package links.
-- ============================================================================

-- --- Patients: age in years+months+days (the image has M and D next to age) ---


USE imlab_t_citydiag;
ALTER TABLE patients ADD COLUMN age_months INT NOT NULL DEFAULT 0 AFTER age_years;
ALTER TABLE patients ADD COLUMN age_days   INT NOT NULL DEFAULT 0 AFTER age_months;

-- --- Tests: sample type shown next to each test in the picker (EDTA WB, Serum...) ---
ALTER TABLE tests ADD COLUMN sample_type VARCHAR(30) NULL AFTER short_name;

-- --- Referral doctors master (search + quick-add from registration) ---
CREATE TABLE referral_doctors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  mobile VARCHAR(20) NULL,
  hospital VARCHAR(120) NULL,
  is_active BOOL NOT NULL DEFAULT 1,
  KEY ix_doc_name (name)
);

-- --- Hospitals / corporates master (the "Search Hospital" box) ---
CREATE TABLE hospitals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20) NULL,
  is_active BOOL NOT NULL DEFAULT 1,
  KEY ix_hosp_name (name)
);

-- --- Sample collectors master + fee is stored on the booking ---
CREATE TABLE sample_collectors (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  mobile VARCHAR(20) NULL,
  is_active BOOL NOT NULL DEFAULT 1,
  KEY ix_collector_name (name)
);

-- --- Packages: a bundle sold at its own price (the "Packages" tab) ---
CREATE TABLE packages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOL NOT NULL DEFAULT 1
);
CREATE TABLE package_tests (
  package_id BIGINT NOT NULL,
  test_id BIGINT NOT NULL,
  PRIMARY KEY (package_id, test_id),
  KEY ix_pt_test (test_id)
);

-- --- Bookings: everything the billing header needs ---
ALTER TABLE bookings
  ADD COLUMN token_no INT NOT NULL DEFAULT 0 AFTER bill_no,              -- walk-in queue number, per center per day
  ADD COLUMN patient_type VARCHAR(20) NOT NULL DEFAULT 'WalkIn' AFTER center_id,   -- WalkIn / Referral / Corporate
  ADD COLUMN remark VARCHAR(300) NULL AFTER corporate,
  ADD COLUMN delivery_mode VARCHAR(20) NOT NULL DEFAULT 'ByHand' AFTER payment_mode, -- ByHand / WhatsApp / Email
  ADD COLUMN sample_collector_id BIGINT NULL AFTER delivery_mode,
  ADD COLUMN collector_fee DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER sample_collector_id,
  ADD COLUMN discount_remark VARCHAR(200) NULL AFTER discount;

-- --- Booking lines: a test either stands alone (package_id NULL) or belongs to a package ---
ALTER TABLE booking_tests
  ADD COLUMN package_id BIGINT NULL AFTER test_id,
  ADD COLUMN sample_collected BOOL NOT NULL DEFAULT 0 AFTER price;

-- ============================================================================
-- Seed data so every screen has something to show immediately
-- ============================================================================
UPDATE tests SET sample_type = 'EDTA WB'       WHERE short_name = 'CBC';
UPDATE tests SET sample_type = 'Serum'         WHERE short_name IN ('LIPID','KFT','TFT','VITD');
UPDATE tests SET sample_type = 'Fluoride Plasma' WHERE short_name = 'FBS';
UPDATE tests SET sample_type = 'Pus'           WHERE short_name = 'PUS';

INSERT INTO referral_doctors (name, mobile, hospital) VALUES
 ('Dr. S. Kulkarni', '9822011223', 'City Care Hospital'),
 ('Dr. Meera Joshi', '9867554433', NULL);

INSERT INTO hospitals (name, mobile) VALUES
 ('City Care Hospital', '020-25551122'),
 ('HealthFirst Diagnostics', NULL);

INSERT INTO sample_collectors (name, mobile) VALUES
 ('Ravi Deshmukh', '9090901234'),
 ('Sanika Pawar', '9028112233');

-- One demo package so the Packages tab works on day one
INSERT INTO packages (name, price, sort_order) VALUES ('Fever Panel', 300, 1);
INSERT INTO package_tests (package_id, test_id)
 SELECT p.id, t.id FROM packages p JOIN tests t ON t.short_name IN ('CBC','FBS') WHERE p.name = 'Fever Panel';