/* ==========================================================================
   Admin API routes — used by the doctor's private dashboard.
   Every route except `login` requires a valid session cookie.
   ========================================================================== */

import { jsonResponse, corsHeaders } from "../cors.js";
import { verifyPassword, createSessionToken, verifySessionToken, getSessionCookie } from "../auth.js";

/** Shared guard: returns true if the request has a valid admin session. */
async function isAuthenticated(request, env) {
  const token = getSessionCookie(request);
  return verifySessionToken(env.SESSION_SECRET, token);
}

function sessionCookieHeader(token, env) {
  // HttpOnly: JavaScript on the page can't read it (blocks token theft via XSS).
  // Secure: only sent over HTTPS.
  // SameSite=None + Secure is required because the admin page (GitHub Pages)
  // and the API (Cloudflare Workers) are different sites; in local dev over
  // http we relax Secure — see worker/README.md.
  const isLocal = env.ALLOWED_ORIGIN.startsWith("http://127.0.0.1") || env.ALLOWED_ORIGIN.startsWith("http://localhost");
  const secureFlag = isLocal ? "" : "Secure; ";
  const sameSite = isLocal ? "Lax" : "None";
  return `session=${token}; HttpOnly; ${secureFlag}SameSite=${sameSite}; Path=/; Max-Age=28800`;
}

/** POST /api/admin/login */
export async function login(request, env) {
  const body = await request.json().catch(() => null);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return jsonResponse({ error: "Username and password are required." }, env, 400);
  }

  // Constant-shape check: always attempt verification (even on username
  // mismatch) so response timing doesn't reveal whether the username exists.
  const usernameMatches = username === env.ADMIN_USERNAME;
  const passwordMatches = await verifyPassword(password, env.ADMIN_PASSWORD_SALT, env.ADMIN_PASSWORD_HASH);

  if (!usernameMatches || !passwordMatches) {
    return jsonResponse({ error: "Invalid username or password." }, env, 401);
  }

  const token = await createSessionToken(env.SESSION_SECRET);
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieHeader(token, env),
      ...corsHeaders(env),
    },
  });
}

/** POST /api/admin/logout */
export function logout(env) {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "session=; HttpOnly; Path=/; Max-Age=0",
      ...corsHeaders(env),
    },
  });
}

/** GET /api/admin/appointments?range=today|upcoming — full details, login required. */
export async function getAppointments(request, env) {
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: "Please log in." }, env, 401);
  }

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "upcoming";
  const today = new Date().toISOString().slice(0, 10);

  let query;
  if (range === "today") {
    query = env.DB.prepare(
      "SELECT id, date, time, status, consultation_type, patient_name, patient_phone, booking_reference, zoom_join_url FROM appointments WHERE date = ? ORDER BY time"
    ).bind(today);
  } else {
    query = env.DB.prepare(
      "SELECT id, date, time, status, consultation_type, patient_name, patient_phone, booking_reference, zoom_join_url FROM appointments WHERE date >= ? ORDER BY date, time"
    ).bind(today);
  }

  const { results } = await query.all();

  const bookedCount = results.filter((r) => r.status === "BOOKED").length;

  return jsonResponse({ appointments: results, bookedCount, totalCount: results.length }, env);
}

/** POST /api/admin/slots — doctor adds one or more new AVAILABLE slots. */
export async function addSlots(request, env) {
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: "Please log in." }, env, 401);
  }

  const body = await request.json().catch(() => null);
  const slots = body?.slots; // [{ date, time }, ...]
  if (!Array.isArray(slots) || slots.length === 0) {
    return jsonResponse({ error: "Provide at least one { date, time } slot." }, env, 400);
  }

  const statements = slots.map(({ date, time }) =>
    env.DB.prepare("INSERT INTO appointments (date, time, status) VALUES (?, ?, 'AVAILABLE')").bind(date, time)
  );
  await env.DB.batch(statements);

  return jsonResponse({ success: true, created: slots.length }, env);
}

/** POST /api/admin/appointment-action — block / cancel / complete / delete a slot by id. */
export async function updateAppointmentStatus(request, env) {
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: "Please log in." }, env, 401);
  }

  const body = await request.json().catch(() => null);
  const { id, action } = body || {};

  // "delete" is handled separately below because it removes the row
  // entirely instead of changing its status, and only ever for slots
  // that were never booked (we don't want to lose booking history).
  if (action === "delete") {
    if (!id) return jsonResponse({ error: "Provide a valid id." }, env, 400);
    const result = await env.DB.prepare("DELETE FROM appointments WHERE id = ? AND status = 'AVAILABLE'")
      .bind(id)
      .run();
    if (result.meta.changes === 0) {
      return jsonResponse({ error: "Only never-booked (AVAILABLE) slots can be deleted." }, env, 400);
    }
    return jsonResponse({ success: true }, env);
  }

  const allowedActions = {
    block: "BLOCKED",
    cancel: "CANCELLED",
    complete: "COMPLETED",
    unblock: "AVAILABLE",
  };

  if (!id || !allowedActions[action]) {
    return jsonResponse({ error: "Provide a valid id and action (block/cancel/complete/unblock)." }, env, 400);
  }

  await env.DB.prepare("UPDATE appointments SET status = ? WHERE id = ?").bind(allowedActions[action], id).run();
  return jsonResponse({ success: true }, env);
}

/** POST /api/admin/block-day — { date, action: 'block' | 'unblock' } for a whole day at once.
 *  Only ever touches AVAILABLE<->BLOCKED slots, so it never disturbs an
 *  already-booked patient's appointment.
 */
export async function blockDay(request, env) {
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: "Please log in." }, env, 401);
  }

  const body = await request.json().catch(() => null);
  const { date, action } = body || {};
  if (!date || !["block", "unblock"].includes(action)) {
    return jsonResponse({ error: "Provide a date and action ('block' or 'unblock')." }, env, 400);
  }

  const [fromStatus, toStatus] = action === "block" ? ["AVAILABLE", "BLOCKED"] : ["BLOCKED", "AVAILABLE"];
  const result = await env.DB.prepare("UPDATE appointments SET status = ? WHERE date = ? AND status = ?")
    .bind(toStatus, date, fromStatus)
    .run();

  return jsonResponse({ success: true, updated: result.meta.changes }, env);
}

/* --------------------------------------------------------------------------
   Weekly availability template + slot generator.

   Beginner note on the date math: Cloudflare Workers run in UTC, so
   `Date.now()` and friends give UTC time. India Standard Time (IST) is
   always UTC+5:30 with no daylight-saving changes, so we can safely just
   add 5.5 hours to get "what day/time is it in India right now" without
   needing a timezone database.
   -------------------------------------------------------------------------- */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function indiaDateStringForOffset(daysFromToday) {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  nowIst.setUTCDate(nowIst.getUTCDate() + daysFromToday);
  return nowIst.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function dayOfWeekForDateString(dateStr) {
  // Treat the date string as a plain calendar date (no time-of-day math).
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday ... 6 = Saturday
}

/** Turns "13:30" + duration 30 into ["13:30", "14:00", "14:30", ...] up to (not including) end_time. */
function expandTimeRange(startTime, endTime, durationMinutes) {
  const times = [];
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  let minutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (minutes + durationMinutes <= endMinutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    times.push(`${h}:${m}`);
    minutes += durationMinutes;
  }
  return times;
}

/** GET /api/admin/weekly-schedule — the doctor's recurring availability template. */
export async function getWeeklySchedule(request, env) {
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: "Please log in." }, env, 401);
  }
  const { results } = await env.DB.prepare(
    "SELECT id, day_of_week, start_time, end_time, slot_duration_minutes FROM weekly_schedule ORDER BY day_of_week"
  ).all();
  return jsonResponse({ schedule: results }, env);
}

/** POST /api/admin/weekly-schedule — replaces the whole template with what the doctor set on screen.
 *  Body: { schedule: [{ dayOfWeek, startTime, endTime, slotDurationMinutes }, ...] }
 *  This only changes the TEMPLATE — it does not touch existing appointments.
 *  Run "generate-slots" afterwards to create new bookable slots from it.
 */
export async function updateWeeklySchedule(request, env) {
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: "Please log in." }, env, 401);
  }

  const body = await request.json().catch(() => null);
  const schedule = body?.schedule;
  if (!Array.isArray(schedule)) {
    return jsonResponse({ error: "Provide a schedule array." }, env, 400);
  }

  const statements = [env.DB.prepare("DELETE FROM weekly_schedule")];
  schedule.forEach((row) => {
    statements.push(
      env.DB.prepare(
        "INSERT INTO weekly_schedule (day_of_week, start_time, end_time, slot_duration_minutes) VALUES (?, ?, ?, ?)"
      ).bind(row.dayOfWeek, row.startTime, row.endTime, row.slotDurationMinutes || 30)
    );
  });
  await env.DB.batch(statements);

  return jsonResponse({ success: true }, env);
}

/** POST /api/admin/generate-slots — { days: 30 } expands the template into real slots.
 *  Safe to re-run: it never duplicates a date/time that already exists, and
 *  never touches already-booked/blocked/cancelled slots.
 */
export async function generateSlots(request, env) {
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: "Please log in." }, env, 401);
  }

  const body = await request.json().catch(() => ({}));
  const days = Math.min(Math.max(Number(body?.days) || 30, 1), 90); // sensible bounds

  const { results: templateRows } = await env.DB.prepare(
    "SELECT day_of_week, start_time, end_time, slot_duration_minutes FROM weekly_schedule"
  ).all();

  if (templateRows.length === 0) {
    return jsonResponse({ error: "No weekly schedule set yet. Save one first." }, env, 400);
  }

  const statements = [];
  for (let offset = 0; offset < days; offset++) {
    const date = indiaDateStringForOffset(offset);
    const dayOfWeek = dayOfWeekForDateString(date);
    const matchingRows = templateRows.filter((row) => row.day_of_week === dayOfWeek);

    matchingRows.forEach((row) => {
      const times = expandTimeRange(row.start_time, row.end_time, row.slot_duration_minutes);
      times.forEach((time) => {
        // INSERT ... WHERE NOT EXISTS makes this safe to run repeatedly:
        // it only adds a slot if that exact date/time doesn't exist yet
        // (so it never overwrites a booking, block, or a slot you added manually).
        statements.push(
          env.DB.prepare(
            `INSERT INTO appointments (date, time, status)
             SELECT ?, ?, 'AVAILABLE'
             WHERE NOT EXISTS (SELECT 1 FROM appointments WHERE date = ? AND time = ?)`
          ).bind(date, time, date, time)
        );
      });
    });
  }

  if (statements.length === 0) {
    return jsonResponse({ success: true, created: 0, message: "No matching days in this range." }, env);
  }

  await env.DB.batch(statements);
  return jsonResponse({
    success: true,
    slotsChecked: statements.length,
    note: "Existing slots (booked/blocked/already generated) were left untouched; only missing ones were added.",
  }, env);
}

/** POST /api/admin/settings — e.g. { inPersonEnabled: true } to open in-person visits. */
export async function updateSettings(request, env) {
  if (!(await isAuthenticated(request, env))) {
    return jsonResponse({ error: "Please log in." }, env, 401);
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.inPersonEnabled !== "boolean") {
    return jsonResponse({ error: "inPersonEnabled (true/false) is required." }, env, 400);
  }

  await env.DB.prepare("UPDATE clinic_settings SET value = ? WHERE key = 'in_person_enabled'")
    .bind(body.inPersonEnabled ? "true" : "false")
    .run();

  return jsonResponse({ success: true }, env);
}
