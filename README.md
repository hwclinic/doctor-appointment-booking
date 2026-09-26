# Doctor Appointment Booking Website (Learning Project)

## What this project is

A free (€0/₹0), beginner-friendly appointment booking website for a
homeopathic doctor's clinic. This is a **learning project** — every
architectural decision is explained so a non-programmer can follow along
and understand what's happening.

**⚠️ IMPORTANT: This project currently uses only FAKE/PLACEHOLDER data.
Never enter real patient names, phone numbers, emails, or medical
information anywhere in this repository or website.**

## Current stage: Stage 2 — Real backend (Cloudflare Workers + D1)

What exists right now:

- A public website with Home, About, Services, Book Appointment and
  Cancel Appointment pages.
- A real backend (`worker/`) — a Cloudflare Worker (API) backed by
  Cloudflare D1 (a free SQLite-compatible database). See
  `worker/README.md` for how to run and deploy it.
- Booking, availability, and cancellation are all real (server-checked),
  using only fake/test data. Double-booking is prevented server-side.
- A doctor admin dashboard (`admin/`) with login, appointment list, slot
  creation, and an in-person-consultations on/off toggle.
- Cancellation only ever requires the booking reference number, and is
  rate-limited (2 attempts) before pointing the patient to call/message
  the clinic directly — never a name/phone lookup.

## Architecture (current)

```
PUBLIC INTERNET
      |
      v
GitHub Pages (this website: index.html, book.html, admin/, ...)
      |
      v
Cloudflare Worker (worker/src/index.js) -- the API, the only thing
      |                                    allowed to touch the database
      v
Cloudflare D1 (private database, "worker/schema.sql")
```

- **GitHub Pages**: free static website hosting, URL like
  `https://YOUR-USERNAME.github.io/doctor-appointment-booking/`.
- **Cloudflare Workers**: free backend/API layer. 100,000 requests/day
  free, no credit card required.
- **Cloudflare D1**: free database. 5 GB storage, 5M reads/100K writes
  per day free, no credit card required.

All of these services are free for this scale of use.

## Technologies used

- Frontend: HTML, CSS, JavaScript — no framework, no build step.
- Backend: Cloudflare Workers (JavaScript) + Cloudflare D1 (SQL/SQLite).
- Local development: Node.js + `wrangler` (Cloudflare's free CLI tool).

## How to run it locally

1. Start the backend first — see `worker/README.md` (`npm install`,
   `npm run db:init:local`, `npm run dev`). It runs at
   `http://127.0.0.1:8787`.
2. Open this folder's `index.html` with VS Code's "Live Server"
   extension so the site runs at `http://127.0.0.1:5500` (matches the
   backend's allowed origin). Click around: Home → Book Appointment →
   pick a date/time/consultation type → Confirm. Try Cancel Appointment
   with the reference number you receive. Try `admin/index.html` with
   username `doctor` / password `TestAdmin123!` (local test account).

## Project structure

```
doctor-appointment-booking/
├── index.html         Home page
├── about.html         About the doctor (placeholder content)
├── services.html      Services list (placeholder content)
├── book.html          Appointment booking (calls the real backend API)
├── cancel.html        Cancellation by booking reference only
├── css/
│   └── styles.css     All styling for every page
├── js/
│   ├── config.js      The one place that knows the backend's URL
│   ├── booking.js     Booking page logic (calls /api/... endpoints)
│   └── cancel.js      Cancel page logic
├── admin/
│   ├── index.html     Doctor login page
│   ├── dashboard.html Doctor dashboard (appointments, slots, settings)
│   └── admin.js        Dashboard logic
├── worker/            Backend: Cloudflare Worker + D1 (see worker/README.md)
└── README.md          This file
```

## Privacy considerations

- Only `patient_name`, `patient_phone`, and appointment scheduling fields
  are ever stored — no email, no medical/health information, no address.
- The public site never shows a patient's name, phone, or any identifying
  detail — only whether a slot is "Available" or "Booked".
- Real patient data would live only in the private Cloudflare D1
  database, reachable only through the Worker API — never directly from
  the browser, and the database credentials never appear in frontend code.
- Cancellation only ever accepts a booking reference number (never name
  or phone), so one patient can never search for or guess another
  patient's booking. After 2 failed attempts, the patient is told to
  contact the clinic directly instead of continuing to guess.

## Security considerations

- The Worker re-checks slot availability and the in-person setting on
  the server before confirming any booking — the browser is never
  trusted, preventing both double-booking and bypassing the "in-person
  not open yet" rule via dev tools.
- The doctor's admin password is never stored in plain text (only a
  salted PBKDF2 hash), and admin sessions use a signed, `HttpOnly`
  cookie that JavaScript cannot read.
- No secrets (passwords, session keys, API tokens) are ever committed to
  Git — see `worker/.gitignore` and `worker/README.md`.

## Known limitations (Stage 2)

- Single admin account only (one doctor, one password) — not a
  multi-user system.
- No SMS/email confirmations yet.
- Date selection on the booking page is a small fixed demo list, not a
  full calendar yet.
- **This architecture has not been reviewed for real patient/medical
  data.** It is appropriate for learning and for genuinely fake/test
  data. Before ever entering real patient information, a dedicated
  privacy/security review (and, depending on jurisdiction, legal/
  compliance review — e.g. India's DPDP Act for health data) is required.

## Using fake/test data

Use only clearly fake data during development, for example:

- Name: `Test Patient 1`
- Phone: `9999999999`
- Email: `test@example.com`

## Next stage (not started yet)

Stage 3 ideas (to discuss before building): SMS/email confirmations,
a real calendar-based date picker, multi-day slot bulk creation, and
eventually planning the Android app against the same Worker API.

## Git and GitHub (coming up next)

This folder is ready to become a Git repository. Next step: run
`git init`, review `.gitignore`, then `git add` and `git commit` the
initial version — we'll do this together step by step.
