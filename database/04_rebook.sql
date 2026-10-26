-- Rebook flag: 1 when a booking reused an existing patient (revisit/rebook).
-- The printed receipt reads this to draw the REBOOK ribbon. Run once.
USE imlab_t_citydiag;
ALTER TABLE bookings ADD COLUMN is_rebook TINYINT(1) NOT NULL DEFAULT 0;