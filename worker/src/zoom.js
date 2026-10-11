/* ==========================================================================
   Zoom meeting creation via "Server-to-Server OAuth" (Zoom's app type for
   automation where only YOU, the app owner, need to authorize once when
   creating the app in the Zoom Marketplace — patients never see or touch
   any Zoom login).

   Beginner note on the flow:
   1. We ask Zoom for a short-lived "access token" using our app's
      Account ID + Client ID + Client Secret (like a backstage pass).
   2. We use that access token to ask Zoom to create a meeting and hand
      us back a unique "join_url" for it.
   Both steps happen entirely on the server — the browser never sees
   these credentials.

   If Zoom isn't configured yet (no secrets set), we simply return `null`
   so bookings still succeed — the confirmation page will say the video
   link will be shared separately, instead of the whole booking failing.
   ========================================================================== */

/*

* Zoom meeting creation via Server-to-Server OAuth.
*
* Required Cloudflare Worker secrets:
* ZOOM_ACCOUNT_ID
* ZOOM_CLIENT_ID
* ZOOM_CLIENT_SECRET
*
* Returns the patient-facing Zoom join URL on success.
* Returns null if Zoom meeting creation fails.
  */

async function getZoomAccessToken(env) {
const accountId = env.ZOOM_ACCOUNT_ID;
const clientId = env.ZOOM_CLIENT_ID;
const clientSecret = env.ZOOM_CLIENT_SECRET;

if (!accountId || !clientId || !clientSecret) {
throw new Error(
"Zoom configuration is incomplete. Check Worker secrets."
);
}

const params = new URLSearchParams({
grant_type: "account_credentials",
account_id: accountId,
});

const credentials = btoa(`${clientId}:${clientSecret}`);

const response = await fetch(
`https://zoom.us/oauth/token?${params.toString()}`,
{
method: "POST",
headers: {
Authorization: `Basic ${credentials}`,
},
}
);

if (!response.ok) {
const errorDetails = await response.text();

console.error("Zoom OAuth token request failed:", {
  status: response.status,
  details: errorDetails,
});

throw new Error(
  `Zoom OAuth failed with HTTP ${response.status}`
);

}

const data = await response.json();

if (!data.access_token) {
throw new Error("Zoom access token is missing.");
}

return data.access_token;
}

/**

* Creates a scheduled Zoom meeting.
*
* @param {object} env - Cloudflare Worker environment and secrets.
* @param {object} options - Appointment details.
* @param {string} options.date - Appointment date: YYYY-MM-DD.
* @param {string} options.time - Appointment time: HH:mm.
* @param {string} options.topic - Meeting title.
* @returns {Promise<string|null>} Zoom join URL or null on failure.
  */
  export async function createZoomMeeting(env, options = {}) {
  try {
  if (
  !env.ZOOM_ACCOUNT_ID ||
  !env.ZOOM_CLIENT_ID ||
  !env.ZOOM_CLIENT_SECRET
  ) {
  console.error(
  "Zoom is not configured: required Worker secrets are missing."
  );
  return null;
  }

  const { date, time, topic } = options;

  if (!date || !time) {
  console.error(
  "Zoom meeting creation skipped: appointment date or time is missing."
  );
  return null;
  }

  /*

  * This project currently assumes appointment times are in
  * India Standard Time (UTC+05:30).
    */
    const appointmentDate = new Date(
    `${date}T${time}:00+05:30`
    );

  if (Number.isNaN(appointmentDate.getTime())) {
  console.error("Invalid appointment date/time:", {
  date,
  time,
  });
  return null;
  }

  const startTimeUtc = appointmentDate.toISOString();

  // Authenticate with Zoom.
  const accessToken = await getZoomAccessToken(env);

  // Create the scheduled meeting.
  const response = await fetch(
  "https://api.zoom.us/v2/users/me/meetings",
  {
  method: "POST",
  headers: {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  },
  body: JSON.stringify({
  topic: topic || "Doctor Consultation",
  type: 2,
  start_time: startTimeUtc,
  duration: 30,
  timezone: "Asia/Kolkata",
  settings: {
  join_before_host: true,
  waiting_room: true,
  },
  }),
  }
  );

  if (!response.ok) {
  const errorDetails = await response.text();

  console.error("Zoom meeting creation failed:", {
  status: response.status,
  details: errorDetails,
  });

  return null;
  }

  const meeting = await response.json();

  if (!meeting.join_url) {
  console.error(
  "Zoom response did not contain a join_url.",
  {
  meetingId: meeting.id || null,
  }
  );
  return null;
  }

  console.log("Zoom meeting created successfully.", {
  meetingId: meeting.id || null,
  });

  return meeting.join_url;
  } catch (error) {
  console.error("Zoom integration error:", {
  message:
  error instanceof Error
  ? error.message
  : String(error),
  });

  return null;
  }
  }
