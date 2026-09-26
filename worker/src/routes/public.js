/* ==========================================================================
   Public API routes — used by the patient-facing website.
   No login required, and these functions must NEVER return another
   patient's name/phone/reference.
   ========================================================================== */

import { jsonResponse } from "../cors.js";
import { generateBookingReference } from "../reference.js";
import { createZoomMeeting } from "../zoom.js";

// Shared across BOTH cancellation and "view my booking" lookups, because
// both accept only a booking reference and are equally guessable — an
// attacker shouldn't get 2 tries on each endpoint (4 total), just 2 total.
const MAX_REFERENCE_ATTEMPTS = 2;      // per your requirement
const ATTEMPT_WINDOW_MINUTES = 15;

const CONTACT_CLINIC_MESSAGE =
  "We couldn't find that booking. Please call the clinic at [Clinic Phone Number Placeholder] or send a message to cancel/check your appointment.";

/** Returns true if this visitor (by IP) has used up their attempts recently. */
async function isRateLimited(env, ip) {
  // Beginner note: we let SQLite compute "now minus 15 minutes" itself
  // (datetime('now', '-15 minutes')) instead of building the timestamp in
  // JavaScript, so the format always matches what's stored in the table.
  const attemptsRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM cancel_attempts
     WHERE ip = ? AND attempted_at > datetime('now', ?)`
  )
    .bind(ip, `-${ATTEMPT_WINDOW_MINUTES} minutes`)
    .first();
  return (attemptsRow?.count || 0) >= MAX_REFERENCE_ATTEMPTS;
}

async function recordFailedAttempt(env, ip) {
  await env.DB.prepare("INSERT INTO cancel_attempts (ip) VALUES (?)").bind(ip).run();
}

/** GET /api/settings — tells the website whether in-person booking is open. */
export async function getSettings(env) {
  const row = await env.DB.prepare("SELECT value FROM clinic_settings WHERE key = 'in_person_enabled'").first();
  const inPersonEnabled = row?.value === "true";
  return jsonResponse({ inPersonEnabled }, env);
}

/** GET /api/availability?date=YYYY-MM-DD — only ever returns time + status. */
export async function getAvailability(request, env) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: "A valid date (YYYY-MM-DD) is required." }, env, 400);
  }

  const { results } = await env.DB.prepare(
    "SELECT time, status FROM appointments WHERE date = ? AND status IN ('AVAILABLE','BOOKED') ORDER BY time"
  )
    .bind(date)
    .all();

  // Explicitly rebuild the objects so we can NEVER accidentally leak an
  // extra column (like patient_name) even if the SQL above is edited later.
  const slots = results.map((row) => ({ time: row.time, status: row.status }));
  return jsonResponse({ date, slots }, env);
}

/** POST /api/book — creates a booking, re-checking availability on the server. */
export async function createBooking(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: "Invalid request." }, env, 400);

  const { date, time, patientName, patientPhone, consultationType } = body;

  if (!date || !time || !patientName?.trim() || !patientPhone?.trim()) {
    return jsonResponse({ error: "Date, time, name and phone number are all required." }, env, 400);
  }
  if (!["online", "in_person"].includes(consultationType)) {
    return jsonResponse({ error: "Please choose a consultation type." }, env, 400);
  }

  // Server-side re-check: in-person must currently be enabled by the clinic.
  if (consultationType === "in_person") {
    const setting = await env.DB.prepare("SELECT value FROM clinic_settings WHERE key = 'in_person_enabled'").first();
    if (setting?.value !== "true") {
      return jsonResponse({ error: "In-person consultations are not yet open." }, env, 400);
    }
  }

  const reference = generateBookingReference();

  // Beginner note — preventing double-booking:
  // This UPDATE only succeeds if a row with this exact date/time is STILL
  // 'AVAILABLE' at the moment it runs. SQLite (which powers D1) executes
  // one write at a time per database, so this is an atomic "claim" of the
  // slot: two people submitting at the same instant cannot both succeed.
  // We check `meta.changes` afterwards to know whether we actually won
  // the race.
  const result = await env.DB.prepare(
    `UPDATE appointments
     SET status = 'BOOKED', patient_name = ?, patient_phone = ?, consultation_type = ?, booking_reference = ?
     WHERE date = ? AND time = ? AND status = 'AVAILABLE'`
  )
    .bind(patientName.trim(), patientPhone.trim(), consultationType, reference, date, time)
    .run();

  if (result.meta.changes === 0) {
    return jsonResponse({ error: "Sorry, that slot was just booked by someone else. Please pick another." }, env, 409);
  }

  // For online consultations, try to create a unique Zoom meeting for this
  // booking. If Zoom isn't configured yet, or the call fails, we still
  // return a successful booking — the patient just won't have a link yet
  // (the confirmation page explains this). We never let a Zoom hiccup
  // undo an already-confirmed appointment.
  let zoomJoinUrl = null;
  if (consultationType === "online") {
    zoomJoinUrl = await createZoomMeeting(env, {
      date,
      time,
      topic: `Doctor Consultation — ${reference}`,
    });
    if (zoomJoinUrl) {
      await env.DB.prepare("UPDATE appointments SET zoom_join_url = ? WHERE booking_reference = ?")
        .bind(zoomJoinUrl, reference)
        .run();
    }
  }

  return jsonResponse({ referenceNumber: reference, date, time, consultationType, zoomJoinUrl }, env);
}

/** POST /api/cancel — the ONLY input is the booking reference (by design). */
export async function cancelBooking(request, env) {
  const body = await request.json().catch(() => null);
  const reference = body?.reference?.trim();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  if (await isRateLimited(env, ip)) {
    return jsonResponse({ error: CONTACT_CLINIC_MESSAGE, contactClinic: true }, env, 429);
  }

  if (!reference) {
    return jsonResponse({ error: "Please enter your booking reference." }, env, 400);
  }

  const appointment = await env.DB.prepare(
    "SELECT id, date, time, status FROM appointments WHERE booking_reference = ?"
  )
    .bind(reference)
    .first();

  if (!appointment || appointment.status !== "BOOKED") {
    await recordFailedAttempt(env, ip);
    return jsonResponse({ error: CONTACT_CLINIC_MESSAGE, contactClinic: true }, env, 404);
  }

  await env.DB.prepare("UPDATE appointments SET status = 'CANCELLED' WHERE id = ?").bind(appointment.id).run();

  return jsonResponse({
    message: `Your appointment on ${appointment.date} at ${appointment.time} has been cancelled.`,
  }, env);
}

/** POST /api/view-booking — the ONLY input is the booking reference.
 *  Lets a patient retrieve their own date/time/Zoom link again if they
 *  forgot to save it, without ever exposing anyone else's information.
 */
export async function viewBooking(request, env) {
  const body = await request.json().catch(() => null);
  const reference = body?.reference?.trim();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  if (await isRateLimited(env, ip)) {
    return jsonResponse({ error: CONTACT_CLINIC_MESSAGE, contactClinic: true }, env, 429);
  }

  if (!reference) {
    return jsonResponse({ error: "Please enter your booking reference." }, env, 400);
  }

  const appointment = await env.DB.prepare(
    "SELECT date, time, status, consultation_type, zoom_join_url FROM appointments WHERE booking_reference = ?"
  )
    .bind(reference)
    .first();

  if (!appointment || !["BOOKED", "COMPLETED", "CANCELLED"].includes(appointment.status)) {
    await recordFailedAttempt(env, ip);
    return jsonResponse({ error: CONTACT_CLINIC_MESSAGE, contactClinic: true }, env, 404);
  }

  return jsonResponse({
    date: appointment.date,
    time: appointment.time,
    status: appointment.status,
    consultationType: appointment.consultation_type,
    zoomJoinUrl: appointment.zoom_join_url,
  }, env);
}
