/* ==========================================================================
   Admin page logic (login + dashboard).
   Beginner note: `credentials: "include"` tells the browser "send/accept
   cookies even though this request goes to a different origin (site)".
   Without it, the session cookie set at login would never be sent back on
   later requests, and every dashboard call would fail with 401.
   ========================================================================== */

async function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const errorBox = document.getElementById("login-error");
  errorBox.style.display = "none";

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json();

    if (!response.ok) {
      errorBox.textContent = result.error || "Login failed.";
      errorBox.style.display = "block";
      return;
    }

    window.location.href = "dashboard.html";
  } catch (err) {
    errorBox.textContent = "Could not reach the server. Please check your connection.";
    errorBox.style.display = "block";
  }
}

async function loadDashboard() {
  const response = await fetch(`${API_BASE_URL}/api/admin/appointments?range=upcoming`, {
    credentials: "include",
  });

  if (response.status === 401) {
    window.location.href = "index.html";
    return;
  }

  const data = await response.json();
  document.getElementById("stat-total").textContent = data.totalCount;
  document.getElementById("stat-booked").textContent = data.bookedCount;

  const settingsResponse = await fetch(`${API_BASE_URL}/api/settings`);
  const settings = await settingsResponse.json();
  document.getElementById("in-person-toggle").checked = settings.inPersonEnabled;

  renderAppointments(data.appointments);
}

function renderAppointments(appointments) {
  const tbody = document.getElementById("appointments-body");
  tbody.innerHTML = "";

  appointments.forEach((appt) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);">${appt.date}</td>
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);">${appt.time}</td>
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);">${appt.status}</td>
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);">${appt.consultation_type || "-"}</td>
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);">${appt.patient_name || "-"}</td>
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);">${appt.patient_phone || "-"}</td>
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);">${appt.booking_reference || "-"}</td>
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);">${appt.zoom_join_url ? `<a href="${appt.zoom_join_url}" target="_blank" rel="noopener">Join link</a>` : "-"}</td>
      <td style="padding:0.5rem; border-bottom:1px solid var(--color-border);"></td>
    `;

    const actionsCell = row.lastElementChild;
    if (appt.status === "AVAILABLE") {
      actionsCell.appendChild(makeActionButton("Block", () => performAction(appt.id, "block")));
      actionsCell.appendChild(makeActionButton("Delete", () => {
        if (confirm("Permanently delete this never-booked slot? This cannot be undone.")) {
          performAction(appt.id, "delete");
        }
      }));
    }
    if (appt.status === "BLOCKED") {
      actionsCell.appendChild(makeActionButton("Unblock", () => performAction(appt.id, "unblock")));
    }
    if (appt.status === "BOOKED") {
      actionsCell.appendChild(makeActionButton("Cancel", () => performAction(appt.id, "cancel")));
      actionsCell.appendChild(makeActionButton("Mark Completed", () => performAction(appt.id, "complete")));
    }

    tbody.appendChild(row);
  });
}

function makeActionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.className = "btn btn-secondary";
  btn.style.padding = "0.3rem 0.6rem";
  btn.style.marginRight = "0.4rem";
  btn.style.fontSize = "0.8rem";
  btn.addEventListener("click", onClick);
  return btn;
}

async function performAction(id, action) {
  await fetch(`${API_BASE_URL}/api/admin/appointment-action`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action }),
  });
  loadDashboard();
}

async function loadWeeklySchedule() {
  const response = await fetch(`${API_BASE_URL}/api/admin/weekly-schedule`, { credentials: "include" });
  if (!response.ok) return;
  const data = await response.json();

  // Reset all checkboxes first.
  document.querySelectorAll('.weekday-checkboxes input[type="checkbox"]').forEach((cb) => (cb.checked = false));

  if (data.schedule.length > 0) {
    // All rows share the same start/end/duration in this simple UI, so we
    // just read them from the first row and check the matching days.
    document.getElementById("schedule-start").value = data.schedule[0].start_time;
    document.getElementById("schedule-end").value = data.schedule[0].end_time;
    document.getElementById("schedule-duration").value = data.schedule[0].slot_duration_minutes;

    data.schedule.forEach((row) => {
      const checkbox = document.querySelector(`.weekday-checkboxes input[value="${row.day_of_week}"]`);
      if (checkbox) checkbox.checked = true;
    });
  }
}

function showScheduleMessage(text) {
  const box = document.getElementById("schedule-message");
  box.textContent = text;
  box.style.display = "block";
}

async function handleSaveWeeklySchedule(event) {
  event.preventDefault();
  const startTime = document.getElementById("schedule-start").value;
  const endTime = document.getElementById("schedule-end").value;
  const slotDurationMinutes = Number(document.getElementById("schedule-duration").value) || 30;

  const checkedDays = [...document.querySelectorAll('.weekday-checkboxes input[type="checkbox"]:checked')].map(
    (cb) => Number(cb.value)
  );

  if (checkedDays.length === 0 || !startTime || !endTime) {
    showScheduleMessage("Please choose at least one day and both start/end times.");
    return;
  }

  const schedule = checkedDays.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime, slotDurationMinutes }));

  await fetch(`${API_BASE_URL}/api/admin/weekly-schedule`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedule }),
  });

  showScheduleMessage("Weekly schedule saved. Click 'Generate Slots' to create real bookable slots from it.");
}

async function handleGenerateSlots() {
  showScheduleMessage("Generating slots...");
  const response = await fetch(`${API_BASE_URL}/api/admin/generate-slots`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days: 30 }),
  });
  const result = await response.json();

  if (!response.ok) {
    showScheduleMessage(result.error || "Could not generate slots.");
    return;
  }

  showScheduleMessage(`Done. ${result.note || ""}`);
  loadDashboard();
}

async function handleAddSlot(event) {
  event.preventDefault();
  const date = document.getElementById("slot-date").value;
  const time = document.getElementById("slot-time").value;
  if (!date || !time) return;

  await fetch(`${API_BASE_URL}/api/admin/slots`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slots: [{ date, time }] }),
  });
  loadDashboard();
}

async function handleBlockDay(event) {
  event.preventDefault();
  const date = document.getElementById("block-day-date").value;
  const action = event.submitter?.dataset.action; // "block" or "unblock"
  if (!date || !action) return;

  await fetch(`${API_BASE_URL}/api/admin/block-day`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, action }),
  });
  loadDashboard();
}

async function handleInPersonToggle(event) {
  await fetch(`${API_BASE_URL}/api/admin/settings`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inPersonEnabled: event.target.checked }),
  });
}

async function handleLogout() {
  await fetch(`${API_BASE_URL}/api/admin/logout`, { method: "POST", credentials: "include" });
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (document.getElementById("appointments-table")) {
    loadDashboard();
    loadWeeklySchedule();
    document.getElementById("weekly-schedule-form").addEventListener("submit", handleSaveWeeklySchedule);
    document.getElementById("generate-slots-btn").addEventListener("click", handleGenerateSlots);
    document.getElementById("add-slot-form").addEventListener("submit", handleAddSlot);
    document.getElementById("block-day-form").addEventListener("submit", handleBlockDay);
    document.getElementById("in-person-toggle").addEventListener("change", handleInPersonToggle);
    document.getElementById("logout-btn").addEventListener("click", handleLogout);
  }
});
