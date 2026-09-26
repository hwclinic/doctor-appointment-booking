/* ==========================================================================
   View My Booking page logic.
   Beginner note: same privacy pattern as Cancel — we only ever send the
   booking reference to the backend, never name or phone number. The
   backend enforces a shared 2-attempt limit (shared with Cancel) before
   telling patients to contact the clinic directly.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("view-booking-form");
  const errorBox = document.getElementById("view-booking-error");
  const resultBox = document.getElementById("view-booking-result");
  const viewBtn = document.getElementById("view-booking-btn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.style.display = "none";
    resultBox.style.display = "none";

    const reference = document.getElementById("reference-input").value.trim();
    if (!reference) return;

    viewBtn.disabled = true;
    viewBtn.textContent = "Looking up...";

    try {
      const response = await fetch(`${API_BASE_URL}/api/view-booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const result = await response.json();

      if (!response.ok) {
        errorBox.textContent = result.error || "Something went wrong. Please try again.";
        errorBox.style.display = "block";
        return;
      }

      let statusLine = "";
      if (result.status === "CANCELLED") {
        statusLine = "<p><strong>Status:</strong> This appointment was cancelled.</p>";
      } else if (result.status === "COMPLETED") {
        statusLine = "<p><strong>Status:</strong> This appointment has already taken place.</p>";
      }

      let zoomLine = "";
      if (result.consultationType === "online") {
        zoomLine = result.zoomJoinUrl
          ? `<p><strong>Video Link:</strong> <a href="${result.zoomJoinUrl}" target="_blank" rel="noopener">${result.zoomJoinUrl}</a></p>`
          : `<p>Your online consultation link will be shared with you separately before your appointment.</p>`;
      }

      resultBox.innerHTML = `
        <h3>Your Booking</h3>
        <p><strong>Date:</strong> ${result.date}</p>
        <p><strong>Time:</strong> ${result.time}</p>
        <p><strong>Consultation Type:</strong> ${result.consultationType === "online" ? "Online" : "In-person"}</p>
        ${zoomLine}
        ${statusLine}
      `;
      resultBox.style.display = "block";
    } catch (err) {
      errorBox.textContent = "Could not reach the server. Please check your connection and try again.";
      errorBox.style.display = "block";
    } finally {
      viewBtn.disabled = false;
      viewBtn.textContent = "View My Booking";
    }
  });
});
