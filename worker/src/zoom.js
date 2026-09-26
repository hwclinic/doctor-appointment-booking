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

async function getZoomAccessToken(env) {
  const params = new URLSearchParams({
    grant_type: "account_credentials",
    account_id: env.ZOOM_ACCOUNT_ID,
  });

  const tokenAuthValue = "Basic " + btoa(env.ZOOM_CLIENT_ID + ":" + env.ZOOM_CLIENT_SECRET);

  const response = await fetch("https://zoom.us/oauth/token?" + params.toString(), {
    method: "POST",
    headers: {
      Authorization: tokenAuthValue,
    },
  });

  if (!response.ok) {
    throw new Error("Zoom token request failed: " + response.status);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Creates a Zoom meeting for a given date/time and returns its join URL.
 * Returns null (never throws) if Zoom isn't configured or the call fails —
 * a missing video link should never block a patient's booking.
 */
export async function createZoomMeeting(env, options) {
  const date = options.date;
  const time = options.time;
  const topic = options.topic;

  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    return null; // Zoom not set up yet — booking still proceeds without a link.
  }

  try {
    const accessToken = await getZoomAccessToken(env);

    // Zoom expects an ISO 8601 UTC start time. Our date/time are in India
    // time (UTC+5:30), so this conversion accounts for that offset.
    const startTimeUtc = new Date(date + "T" + time + ":00+05:30").toISOString();
    const meetingAuthValue = "Bearer " + accessToken;

    const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: meetingAuthValue,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: topic || "Doctor Consultation",
        type: 2, // scheduled meeting
        start_time: startTimeUtc,
        duration: 30,
        timezone: "Asia/Kolkata",
        settings: {
          join_before_host: true,
          waiting_room: true, // doctor admits the patient, preventing strangers from wandering in
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Zoom meeting creation failed:", response.status, errText);
      return null;
    }

    const meeting = await response.json();
    return meeting.join_url || null;
  } catch (err) {
    console.error("Zoom integration error:", err);
    return null;
  }
}
