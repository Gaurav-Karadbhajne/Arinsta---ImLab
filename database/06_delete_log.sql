-- ============================================================
-- Delete Log + Restore (run ONCE per tenant DB that has 03/04/05 applied)
-- Adds soft-delete flags to test lines, package lines and money rows.
-- A "delete" only sets these flags. Restore clears them again.
-- ============================================================
USE imlab_t_citydiag;   -- change this line for another tenant DB

-- 1) Investigation lines: individual tests AND the component tests of a package.
ALTER TABLE booking_tests
  ADD COLUMN is_deleted BOOL NOT NULL DEFAULT 0,
  ADD COLUMN deleted_at DATETIME NULL,
  ADD COLUMN deleted_by BIGINT NULL,
  ADD COLUMN delete_reason VARCHAR(300) NULL,
  ADD KEY ix_bt_live    (booking_id, is_deleted),
  ADD KEY ix_bt_deleted (is_deleted, deleted_at);

-- 2) Package charge lines. A package is ONE row here; its component tests live in booking_tests.
ALTER TABLE booking_packages
  ADD COLUMN is_deleted BOOL NOT NULL DEFAULT 0,
  ADD COLUMN deleted_at DATETIME NULL,
  ADD COLUMN deleted_by BIGINT NULL,
  ADD COLUMN delete_reason VARCHAR(300) NULL,
  ADD KEY ix_bp_live    (booking_id, is_deleted),
  ADD KEY ix_bp_deleted (is_deleted, deleted_at);

-- 3) Money rows (payments + refunds). A deleted receipt stays for audit but is ignored in totals.
ALTER TABLE booking_payments
  ADD COLUMN is_deleted BOOL NOT NULL DEFAULT 0,
  ADD COLUMN deleted_at DATETIME NULL,
  ADD COLUMN deleted_by BIGINT NULL,
  ADD COLUMN delete_reason VARCHAR(300) NULL,
  ADD KEY ix_pay_live    (booking_id, is_deleted),
  ADD KEY ix_pay_deleted (is_deleted, deleted_at);

-- 4) Delete Log: newest deleted first, then offset paging, per center.
ALTER TABLE bookings
  ADD KEY ix_booking_deleted (center_id, is_deleted, deleted_at, id);