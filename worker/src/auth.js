/* ==========================================================================
   Auth helpers: password verification + signed session cookies.

   Beginner note on the approach:
   - We never store the doctor's real password anywhere. Instead, ONE TIME,
     you (the doctor) run a small local script (see worker/README.md) that
     turns your chosen password into a "hash" (a one-way scrambled version).
     You store that hash (and the random "salt" used to create it) as
     Cloudflare secrets. The Worker can check "does this password match the
     hash?" without ever knowing/storing the real password in plain text.
   - After a correct login, we hand the browser a "session cookie": a piece
     of text containing an expiry time, signed with a secret key only the
     Worker knows (HMAC). The browser can't forge or edit it because it
     doesn't have the secret key. Every admin request re-checks this
     signature before returning any patient data.
   ========================================================================== */

const encoder = new TextEncoder();

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/** Verify a submitted password against the stored PBKDF2 hash + salt. */
export async function verifyPassword(password, saltHex, expectedHashHex, iterations = 100000) {
  const salt = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const derivedHex = toHex(derivedBits);
  return derivedHex === expectedHashHex;
}

/** Create a signed session token: "<expiryTimestamp>.<hmacSignature>" */
export async function createSessionToken(secret, ttlSeconds = 60 * 60 * 8) {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(expiry)));
  return `${expiry}.${toHex(signature)}`;
}

/** Check a session token is well-formed, correctly signed, and not expired. */
export async function verifySessionToken(secret, token) {
  if (!token || !token.includes(".")) return false;
  const [expiryStr, signatureHex] = token.split(".");
  const expiry = Number(expiryStr);
  if (!expiry || Date.now() / 1000 > expiry) return false;

  const key = await importHmacKey(secret);
  const expectedSignature = await crypto.subtle.sign("HMAC", key, encoder.encode(expiryStr));
  return toHex(expectedSignature) === signatureHex;
}

/** Read the session cookie value out of a request's Cookie header. */
export function getSessionCookie(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}
