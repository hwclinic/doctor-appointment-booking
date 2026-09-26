/* ==========================================================================
   Cancel Appointment page logic.
   Beginner note: we only ever send the booking reference to the backend.
   The backend enforces its own 2-attempt limit before telling patients to
   contact the clinic directly — this page just displays whatever message
   the backend sends back.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("cancel-form");
  const errorBox = document.getElementById("cancel-error");
  const successBox = document.getElementById("cancel-success");
  const cancelBtn = document.getElementById("cancel-btn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.style.display = "none";
    successBox.style.display = "none";

    const reference = document.getElementById("reference-input").value.trim();
    if (!reference) return;

    cancelBtn.disabled = true;
    cancelBtn.textContent = "Cancelling...";

    try {
      const response = await fetch(`${API_BASE_URL}/api/cancel`, {
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

      successBox.innerHTML = `<p>${result.message}</p>`;
      successBox.style.display = "block";
      form.style.display = "none";
    } catch (err) {
      errorBox.textContent = "Could not reach the server. Please check your connection and try again.";
      errorBox.style.display = "block";
    } finally {
      cancelBtn.disabled = false;
      cancelBtn.textContent = "Cancel Appointment";
    }
  });
});
