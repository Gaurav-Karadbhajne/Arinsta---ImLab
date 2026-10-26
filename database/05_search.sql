-- ============================================================
-- Search page upgrade (run once per tenant DB, e.g. imlab_t_citydiag)
-- 1) stored balance column  -> fast "outstanding only" + cheap stats
-- 2) soft-delete metadata   -> never physically remove a booking
-- 3) composite indexes      -> filters + keyset paging at millions of rows
-- 4) receipt number + refund reason/remark on every money row
-- ============================================================
USE imlab_t_citydiag;

-- 1) Balance is computed by MySQL and stored: reads use an index, code never writes it.
ALTER TABLE bookings
  ADD COLUMN balance DECIMAL(12,2) AS (total - discount - paid) STORED;

-- 2) Deleted bookings stay in the table for the future Delete Log / Revert report.
ALTER TABLE bookings
  ADD COLUMN deleted_at DATETIME NULL,
  ADD COLUMN deleted_by BIGINT NULL,
  ADD COLUMN delete_reason VARCHAR(300) NULL;

-- 3) One index per filter. The trailing id keeps keyset pagination ("id < afterId") fast.
ALTER TABLE bookings
  ADD KEY ix_booking_search     (center_id, is_deleted, id),
  ADD KEY ix_booking_date_range (center_id, is_deleted, booked_at, id),
  ADD KEY ix_booking_corporate  (center_id, is_deleted, corporate, id),
  ADD KEY ix_booking_referral   (center_id, is_deleted, referral_doctor, id),
  ADD KEY ix_booking_balance    (center_id, is_deleted, balance, id),
  ADD KEY ix_booking_billno     (bill_no);

-- Name prefix search needs its own index (the existing one starts with last_name).
ALTER TABLE patients
  ADD KEY ix_patient_first_name (first_name);

-- 4) Every collected payment / refund becomes a receipt with its own number.
ALTER TABLE booking_payments
  ADD COLUMN receipt_no VARCHAR(30) NULL,
  ADD COLUMN reason VARCHAR(120) NULL,
  ADD COLUMN remark VARCHAR(300) NULL,
  ADD KEY ix_pay_receipt (receipt_no);

-- Backfill numbers for payments created before this feature (same shape as new ones).
UPDATE booking_payments
SET receipt_no = CONCAT('R', DATE_FORMAT(paid_at, '%y'), LPAD(id, 6, '0'))
WHERE receipt_no IS NULL;

-- Continue the series after the biggest existing payment id, so no number can repeat.
INSERT INTO number_series (series_key, current_no)
SELECT 'receipt_no', COALESCE(MAX(id), 0) FROM booking_payments
ON DUPLICATE KEY UPDATE current_no = GREATEST(current_no, VALUES(current_no));