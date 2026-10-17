/* ==========================================================================
   Front-end configuration.
   Beginner note: this is the ONE place that knows where our backend API
   lives. In production the Worker uses its workers.dev hostname until a
   custom API hostname is connected in Cloudflare.
   ========================================================================== */

const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE_URL = isLocal
  ? "http://127.0.0.1:8787"
  : "https://doctor-appointment-booking-api.hwclinic.workers.dev";
