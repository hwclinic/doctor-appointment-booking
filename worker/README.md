# Backend (Cloudflare Worker + D1) — Stage 2

This folder is the private backend API. It is the ONLY thing allowed to
read/write the appointment database. The website (in the parent folder)
never talks to the database directly.

## Concepts, in beginner terms

- **Worker**: a small program Cloudflare runs for you whenever a request
  comes in — you don't manage a server, you just write `src/index.js`.
- **D1**: Cloudflare's free SQLite-compatible database. `schema.sql`
  defines its tables.
- **Secrets**: values (passwords, keys) that must never appear in code or
  be committed to Git. For local testing they live in `.dev.vars`
  (already gitignored). For the real deployed site they live in
  Cloudflare's secret store (`wrangler secret put ...`), never in a file.

## One-time setup

```powershell
cd worker
npm install
```

## Running locally (no Cloudflare account needed)

```powershell
# 1. Create your local test database and load the schema + fake data
npm run db:init:local

# 2. Generate a local admin username/password (already done for you —
#    see .dev.vars — but to make your own):
node generate-admin-password.js "YourChosenPassword"
# then copy the printed SALT/HASH into .dev.vars

# 3. Start the Worker locally
npm run dev
```

This starts the API at `http://127.0.0.1:8787`. The default local admin
login (test only!) is:

- Username: `doctor`
- Password: `TestAdmin123!`

Open the website's `index.html` with VS Code's "Live Server" (so it runs
on `http://127.0.0.1:5500`, matching `ALLOWED_ORIGIN` in `wrangler.toml`)
and try booking, cancelling, and the admin dashboard at
`admin/index.html`.

## Deploying for real (when you're ready — separate step, needs a free Cloudflare account)

1. `npx wrangler login` — opens a browser to connect your free Cloudflare account.
2. `npx wrangler d1 create doctor_appointments` — creates your real (still empty) database and prints a `database_id`. Paste that into `wrangler.toml`.
3. `npm run db:init:remote` — creates the tables on your real database (still fake/test data at first — never load real patient data here without a separate security review).
4. Set your real secrets (never put these in a file):
   ```powershell
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD_SALT
   npx wrangler secret put ADMIN_PASSWORD_HASH
   npx wrangler secret put SESSION_SECRET
   ```
   Generate the salt/hash with `node generate-admin-password.js "YourRealPassword"` — pick a strong password only you know.
5. Update `wrangler.toml`'s `ALLOWED_ORIGIN` to your real GitHub Pages URL (e.g. `https://YOUR-USERNAME.github.io`).
6. `npm run deploy` — this prints your live Worker URL, e.g. `https://doctor-appointment-booking-api.YOUR-SUBDOMAIN.workers.dev`.
7. Update `js/config.js` in the website with that URL as `API_BASE_URL`.

## Optional: enabling Zoom video links for online consultations

Online bookings work fine without this — patients just see "your link
will be shared separately." To have the site automatically create a
unique Zoom meeting for every online booking:

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/) → **Develop** → **Build App** → choose **Server-to-Server OAuth**. This app type needs no per-patient or per-doctor login consent — you (the account owner) authorize it once.
2. Add the `meeting:write:meeting:admin` (or equivalent "Create a meeting") scope.
3. Copy the app's **Account ID**, **Client ID**, and **Client Secret**.
4. Set them as secrets (never in a file):
   ```powershell
   npx wrangler secret put ZOOM_ACCOUNT_ID
   npx wrangler secret put ZOOM_CLIENT_ID
   npx wrangler secret put ZOOM_CLIENT_SECRET
   ```
   For local testing, add the same three as plain lines in `.dev.vars` instead (already gitignored).
5. That's it — `worker/src/zoom.js` automatically starts creating meetings once all three values are present. If anything about Zoom fails, the booking still succeeds; only the video link is missing.

## What's stored, and what isn't

Only `patient_name`, `patient_phone`, and system fields (date, time,
status, consultation type, booking reference, Zoom join URL) are stored —
see `schema.sql`. No email, no medical information, no address.

## Security notes specific to this backend

- Passwords are never stored in plain text — only a PBKDF2 hash + salt.
- Admin sessions use an HMAC-signed cookie with an 8-hour expiry, `HttpOnly`
  (JavaScript can't read it) so it can't be stolen via a script injection.
- The server re-checks slot availability and the in-person setting on
  every booking — the browser's opinion is never trusted.
- Cancellation only accepts a booking reference (never name/phone), and
  is rate-limited to 2 attempts per visitor before telling them to
  contact the clinic directly. The "View My Booking" lookup shares this
  same 2-attempt limit, since both accept only a guessable reference.

## Known limitation

This is still a **single-admin** system (one doctor, one password). It
has not been reviewed for handling real patient/medical data — see the
main README's privacy/security notes before ever considering that step.
