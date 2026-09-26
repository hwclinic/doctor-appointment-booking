/* ==========================================================================
   Front-end configuration.
   Beginner note: this is the ONE place that knows where our backend API
   lives. During local development it points at your local Worker
   (wrangler dev). After you deploy the Worker to Cloudflare, change this
   single value to your real Worker URL (e.g.
   "https://doctor-appointment-booking-api.YOUR-SUBDOMAIN.workers.dev").
   Nothing else in the front-end needs to change.
   ========================================================================== */

const API_BASE_URL = "https://doctor-appointment-booking-api.hwclinic.workers.dev";
