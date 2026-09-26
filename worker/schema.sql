-- ==========================================================================
-- Database schema for the Doctor Appointment Booking backend (Cloudflare D1).
-- D1 uses SQLite syntax.
--
-- Beginner note: this file is the "blueprint" for our database tables.
-- Run it once (see worker/README.md) to create the tables, then again
-- any time you want to reset your LOCAL test database.
-- ==========================================================================

-- One row per appointment SLOT. A slot starts as AVAILABLE (created by the
-- doctor). When a patient books it, we fill in patient_name, patient_phone,
-- consultation_type and booking_reference, and set status to BOOKED.
--
-- Data minimization: these are the ONLY personal fields we store —
-- name and phone. Nothing else (no address, no medical info, no email).
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  time TEXT NOT NULL,                 -- 'HH:MM' (24-hour)
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
    -- one of: AVAILABLE, BOOKED, CANCELLED, BLOCKED, COMPLETED
  consultation_type TEXT,             -- 'online' or 'in_person' (set at booking time)
  patient_name TEXT,
  patient_phone TEXT,
  booking_reference TEXT UNIQUE,      -- shown to the patient, used to cancel
  zoom_join_url TEXT,                 -- set for 'online' bookings only, via Zoom API
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simple key/value settings the doctor can change from the admin page.
-- 'in_person_enabled' controls whether patients may choose an in-person
-- consultation on the public booking page.
CREATE TABLE IF NOT EXISTS clinic_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO clinic_settings (key, value) VALUES ('in_person_enabled', 'false');

-- Recurring weekly availability template. The doctor edits this from the
-- admin screen (e.g. "Mon-Fri, 13:30-16:30, 30-minute slots"), and the
-- "generate slots" action expands it into real bookable rows in the
-- `appointments` table for the next N days.
-- day_of_week uses the same convention as JavaScript's Date.getDay():
-- 0 = Sunday, 1 = Monday, ... 6 = Saturday.
CREATE TABLE IF NOT EXISTS weekly_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,           -- 'HH:MM', India time
  end_time TEXT NOT NULL,             -- 'HH:MM', India time
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30
);

-- Default: Monday-Friday, 1:30 PM - 4:30 PM India time, 30-minute slots.
INSERT INTO weekly_schedule (day_of_week, start_time, end_time, slot_duration_minutes) VALUES
  (1, '13:30', '16:30', 30),
  (2, '13:30', '16:30', 30),
  (3, '13:30', '16:30', 30),
  (4, '13:30', '16:30', 30),
  (5, '13:30', '16:30', 30);

-- Tracks failed cancellation lookups per visitor (by IP) so we can stop
-- someone from guessing booking reference codes by brute force.
CREATE TABLE IF NOT EXISTS cancel_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================================
-- FAKE/TEST seed data only — for local development. Never replace this
-- with real patient information in a shared/public database.
-- ==========================================================================
INSERT INTO appointments (date, time, status) VALUES
  ('2026-09-18', '10:00', 'AVAILABLE'),
  ('2026-09-18', '10:30', 'AVAILABLE'),
  ('2026-09-18', '11:00', 'AVAILABLE'),
  ('2026-09-18', '16:00', 'AVAILABLE'),
  ('2026-09-19', '10:00', 'AVAILABLE'),
  ('2026-09-19', '10:30', 'AVAILABLE'),
  ('2026-09-19', '11:00', 'AVAILABLE'),
  ('2026-09-20', '10:00', 'AVAILABLE'),
  ('2026-09-20', '10:30', 'AVAILABLE');
