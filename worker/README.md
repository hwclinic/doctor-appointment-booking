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

Before starting the Worker, add this line to the ignored `worker/.dev.vars`
file so local browser requests are allowed:

```text
ALLOWED_ORIGIN=http://127.0.0.1:5500
```

This starts the API at `http://127.0.0.1:8787`. The default local admin
login (test only!) is:

- Username: `doctor`
- Password: `TestAdmin123!`

Open the website's `index.html` with VS Code's "Live Server" (so it runs
on `http://127.0.0.1:5500`) and try booking, cancelling, and the admin
dashboard at `admin/index.html`.

## Production deployment (requires your Cloudflare account)

1. `npx wrangler login` — opens a browser to connect your free Cloudflare account.
2. Confirm `wrangler.toml` points at the intended D1 database. Do not create
   another database or rerun the schema against a database that already has
   tables; the schema includes sample/default schedule rows.
3. Set the production secrets (never put these in a file). Use a unique,
   strong password that is not the local test password:
   ```powershell
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD_SALT
   npx wrangler secret put ADMIN_PASSWORD_HASH
   npx wrangler secret put SESSION_SECRET
   ```
   Generate the salt/hash locally with
   `node generate-admin-password.js "YourChosenPassword"` and use the
   printed values for the salt and hash. Do not send your password or
   generated secrets in chat or commit them.
4. `wrangler.toml` allows the production website origin `https://hwc-co.in`.
5. Deploy with `npm run deploy` and confirm that `/api/settings` responds
   from the Worker.
6. The website currently uses the Worker `workers.dev` URL in
   `js/config.js`. A custom hostname such as `api.hwc-co.in` can be added
   later in Cloudflare **Workers & Pages → doctor-appointment-booking-api
   → Settings → Domains & Routes**, after the Cloudflare zone is active.
   If using a custom hostname, update `js/config.js` to match it and
   deploy the website again.

### Changing the production admin password

After signing in at `https://hwc-co.in/admin/`, use the **Change Password**
form on the dashboard. Enter the current password and a new password of at
least 12 characters. The Worker verifies the current password and stores a
new salted password hash in D1; the plaintext password is never stored.
Until the first dashboard password change, the Worker continues to use the
configured `ADMIN_PASSWORD_SALT` and `ADMIN_PASSWORD_HASH` secrets.

For a new database, `schema.sql` creates the credentials table. For an
existing production database, apply the additive migration before deploying:

```powershell
npx wrangler d1 execute doctor_appointments --remote --file=./migrations/0002_admin_credentials.sql --config wrangler.toml
```

## Optional: free appointment confirmation email

Resend's free transactional-email tier currently includes up to 3,000
emails per month (100 per day). Sending from the clinic's domain requires
verifying the sending domain first; GoDaddy email hosting is not required.

1. Create a free account at [Resend](https://resend.com/) and add the
   subdomain `updates.hwc-co.in` under **Domains**.
2. In GoDaddy DNS for `hwc-co.in`, add the DNS records Resend displays
   for that subdomain. Copy each record's type, name, and value exactly;
   don't replace the website A records or existing mail/DMARC records.
   Wait until Resend marks the domain verified.
3. Create a Resend API key with permission to send email.
4. Store the key as a Cloudflare Worker secret (never in this repository):
   ```powershell
   npx wrangler secret put RESEND_API_KEY
   ```
5. Deploy the Worker and website after confirming the Cloudflare build
   settings preserve the existing admin secrets. Confirmation messages
   will come from `appointments@updates.hwc-co.in`.

The API sends a short plain-text message with the reference, appointment
date and time in IST, consultation type, and Zoom link when available.
Resend processes the recipient address and message to deliver it; the
Worker does not save the patient's email address in D1. If sending fails,
the booking remains confirmed and the patient is told to save the on-screen
reference. Email remains optional.

For the GitHub Pages website, use the four apex A records and `www` CNAME
documented in the main README. The domain currently uses GoDaddy
nameservers, so add these records at GoDaddy and preserve existing
mail-provider DNS records.

## Optional: enabling Zoom video links for online consultations

Online bookings can still be made without this, but no Zoom link will be
created automatically; the clinic must contact the patient to arrange the
online consultation. To have the site create a unique Zoom meeting for
every online booking:

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
5. That's it — `worker/src/zoom.js` automatically starts creating meetings once all three values are present. If anything about Zoom fails, the booking still succeeds, but the patient must be contacted to arrange the online consultation.

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
