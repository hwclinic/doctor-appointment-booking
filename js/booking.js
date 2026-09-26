/* ==========================================================================
   Booking page logic — now talks to the real Cloudflare Worker API.
   Beginner note: `fetch()` is the browser's built-in way to call an API
   over the network. We `await` each call because network requests take
   time, and we don't want the rest of the code to run before we have a
   real answer.
   ========================================================================== */

let selectedDate = null;
let selectedSlot = null;

// A handful of demo dates for the beginner-friendly date dropdown.
// (Later this could be replaced by a real date picker covering, say, the
// next 14 days — kept simple for now.)
const DEMO_DATES = ["2026-09-18", "2026-09-19", "2026-09-20"];

async function loadSettings() {
  const response = await fetch(`${API_BASE_URL}/api/settings`);
  const settings = await response.json();

  const inPersonRadio = document.getElementById("consult-in-person");
  const inPersonLabel = document.getElementById("in-person-label");

  if (!settings.inPersonEnabled) {
    inPersonRadio.disabled = true;
    inPersonLabel.classList.add("option-disabled");
    inPersonLabel.title = "In-person consultations are not open yet.";
  } else {
    inPersonRadio.disabled = false;
    inPersonLabel.classList.remove("option-disabled");
    inPersonLabel.title = "";
  }
}

function populateDateOptions() {
  const dateSelect = document.getElementById("date-select");
  DEMO_DATES.forEach((date) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date;
    dateSelect.appendChild(option);
  });
}

async function renderSlots(date) {
  const slotList = document.getElementById("slot-list");
  slotList.innerHTML = "<p>Loading available times...</p>";
  selectedSlot = null;
  updateBookButtonState();

  const response = await fetch(`${API_BASE_URL}/api/availability?date=${encodeURIComponent(date)}`);
  if (!response.ok) {
    slotList.innerHTML = "<p>Sorry, we couldn't load appointment times. Please try again.</p>";
    return;
  }
  const data = await response.json();

  slotList.innerHTML = "";
  if (data.slots.length === 0) {
    slotList.innerHTML = "<p>No slots configured for this date yet.</p>";
    return;
  }

  data.slots.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    const isAvailable = slot.status === "AVAILABLE";
    button.className = `slot ${isAvailable ? "available" : "booked"}`;
    button.textContent = `${slot.time} — ${isAvailable ? "Available" : "Booked"}`;
    button.disabled = !isAvailable;

    button.addEventListener("click", () => {
      document.querySelectorAll(".slot").forEach((el) => el.classList.remove("selected"));
      button.classList.add("selected");
      selectedSlot = slot.time;
      updateBookButtonState();
    });

    slotList.appendChild(button);
  });
}

function updateBookButtonState() {
  const bookBtn = document.getElementById("confirm-btn");
  bookBtn.disabled = !(selectedDate && selectedSlot);
}

function handleDateChange(event) {
  selectedDate = event.target.value;
  if (selectedDate) {
    renderSlots(selectedDate);
  } else {
    document.getElementById("slot-list").innerHTML = "";
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();

  const name = document.getElementById("patient-name").value.trim();
  const phone = document.getElementById("patient-phone").value.trim();
  const consultationType = document.querySelector('input[name="consultationType"]:checked')?.value;
  const confirmBtn = document.getElementById("confirm-btn");
  const errorBox = document.getElementById("booking-error");
  errorBox.style.display = "none";

  if (!selectedDate || !selectedSlot || !name || !phone || !consultationType) {
    errorBox.textContent = "Please select a date, an available time, a consultation type, and fill in your name and phone number.";
    errorBox.style.display = "block";
    return;
  }

  confirmBtn.disabled = true;
  confirmBtn.textContent = "Booking...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: selectedDate,
        time: selectedSlot,
        patientName: name,
        patientPhone: phone,
        consultationType,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      errorBox.textContent = result.error || "Something went wrong. Please try again.";
      errorBox.style.display = "block";
      // Someone else may have booked this slot first — refresh the list.
      renderSlots(selectedDate);
      return;
    }

    const confirmation = document.getElementById("confirmation");
    let zoomSection = "";
    if (result.consultationType === "online") {
      zoomSection = result.zoomJoinUrl
        ? `<p><strong>Video Link:</strong> <a href="${result.zoomJoinUrl}" target="_blank" rel="noopener">${result.zoomJoinUrl}</a></p>
           <p>Save this link — you can also find it later using "View My Booking" and your reference number.</p>`
        : `<p>Your online consultation link will be shared with you separately before your appointment.</p>`;
    }
    confirmation.innerHTML = `
      <h3>Booking Confirmed</h3>
      <p><strong>Date:</strong> ${result.date}</p>
      <p><strong>Time:</strong> ${result.time}</p>
      <p><strong>Reference Number:</strong> ${result.referenceNumber}</p>
      ${zoomSection}
      <p>Please save this reference number — you'll need it if you want to cancel or view your booking again.</p>
    `;
    confirmation.style.display = "block";
    document.getElementById("booking-form").style.display = "none";
  } catch (err) {
    errorBox.textContent = "Could not reach the booking server. Please check your connection and try again.";
    errorBox.style.display = "block";
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirm Booking";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  populateDateOptions();
  loadSettings();
  document.getElementById("date-select").addEventListener("change", handleDateChange);
  document.getElementById("booking-form").addEventListener("submit", handleFormSubmit);
});
