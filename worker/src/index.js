/* ==========================================================================
   Doctor Appointment Booking — Cloudflare Worker (backend API)

   Beginner note: a "Worker" is just a small program that runs on
   Cloudflare's servers and responds to HTTP requests — like a tiny web
   server, but you don't manage any actual server. Every request to our
   API arrives here, in the `fetch` function below, and we route it based
   on the URL path.

   This file only handles ROUTING + request/response plumbing. The actual
   logic lives in routes/public.js and routes/admin.js so this file stays
   readable.
   ========================================================================== */

import { corsHeaders, jsonResponse, handleOptions } from "./cors.js";
import * as publicRoutes from "./routes/public.js";
import * as adminRoutes from "./routes/admin.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // Browsers send a "preflight" OPTIONS request before real cross-origin
    // POST requests. We just need to answer it politely.
    if (method === "OPTIONS") {
      return handleOptions(env);
    }

    try {
      // ---------------- Public endpoints (no login needed) ----------------
      if (pathname === "/api/settings" && method === "GET") {
        return publicRoutes.getSettings(env);
      }

      if (pathname === "/api/availability" && method === "GET") {
        return publicRoutes.getAvailability(request, env);
      }

      if (pathname === "/api/book" && method === "POST") {
        return publicRoutes.createBooking(request, env);
      }

      if (pathname === "/api/cancel" && method === "POST") {
        return publicRoutes.cancelBooking(request, env);
      }

      if (pathname === "/api/view-booking" && method === "POST") {
        return publicRoutes.viewBooking(request, env);
      }

      // ---------------- Admin endpoints (login required, except login itself) ----------------
      if (pathname === "/api/admin/login" && method === "POST") {
        return adminRoutes.login(request, env);
      }

      if (pathname === "/api/admin/logout" && method === "POST") {
        return adminRoutes.logout(env);
      }

      if (pathname === "/api/admin/appointments" && method === "GET") {
        return adminRoutes.getAppointments(request, env);
      }

      if (pathname === "/api/admin/slots" && method === "POST") {
        return adminRoutes.addSlots(request, env);
      }

      if (pathname === "/api/admin/appointment-action" && method === "POST") {
        return adminRoutes.updateAppointmentStatus(request, env);
      }

      if (pathname === "/api/admin/block-day" && method === "POST") {
        return adminRoutes.blockDay(request, env);
      }

      if (pathname === "/api/admin/weekly-schedule" && method === "GET") {
        return adminRoutes.getWeeklySchedule(request, env);
      }

      if (pathname === "/api/admin/weekly-schedule" && method === "POST") {
        return adminRoutes.updateWeeklySchedule(request, env);
      }

      if (pathname === "/api/admin/generate-slots" && method === "POST") {
        return adminRoutes.generateSlots(request, env);
      }

      if (pathname === "/api/admin/settings" && method === "POST") {
        return adminRoutes.updateSettings(request, env);
      }

      return jsonResponse({ error: "Not found" }, env, 404);
    } catch (err) {
      // Beginner note: we never send raw error details (which could leak
      // internal info) back to the browser — just a generic message. The
      // real error is only visible in `wrangler tail` / the Cloudflare logs.
      console.error(err);
      return jsonResponse({ error: "Something went wrong. Please try again." }, env, 500);
    }
  },
};
