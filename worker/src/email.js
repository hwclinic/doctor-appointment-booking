const RESEND_API_URL = "https://api.resend.com/emails";

function formatAppointmentDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatAppointmentTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = hours % 12 || 12;
  const period = hours >= 12 ? "pm" : "am";
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

export async function sendBookingConfirmation(env, recipient, appointment) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.error("Confirmation email is not configured.");
    return false;
  }

  const consultationType = appointment.consultationType === "online"
    ? "Online consultation"
    : "In-person consultation";
  const zoomLine = appointment.zoomJoinUrl
    ? `\nZoom link: ${appointment.zoomJoinUrl}`
    : appointment.consultationType === "online"
      ? "\nA Zoom link was not available when this booking was made. Please contact the clinic before your appointment to arrange your online consultation."
      : "";
  const text = [
    "Hello,",
    "",
    "Your appointment with Dr. Revathy is confirmed.",
    `Date: ${formatAppointmentDate(appointment.date)}`,
    `Time: ${formatAppointmentTime(appointment.time)} IST`,
    `Consultation: ${consultationType}`,
    `Booking reference: ${appointment.reference}`,
    zoomLine,
    "",
    "Please keep your booking reference to view or cancel your appointment.",
    "Dr. Revathy's Homoeopathic Wellness Clinic",
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [recipient],
        subject: `Appointment confirmed — ${appointment.reference}`,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error("Confirmation email provider returned HTTP", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Confirmation email delivery failed:", error instanceof Error ? error.name : "unknown error");
    return false;
  }
}
