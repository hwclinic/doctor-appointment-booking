/* ==========================================================================
   Generates a random, unique-looking booking reference shown to patients.
   Example: "APT-7F3K2Q"
   Beginner note: this is NOT a secret — it's like an order number. Its
   only security job is to be hard to *guess*, which is why we combine it
   with rate-limiting on the cancel endpoint (see index.js).
   ========================================================================== */

export function generateBookingReference() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let code = "";
  const randomValues = crypto.getRandomValues(new Uint8Array(6));
  for (let i = 0; i < 6; i++) {
    code += chars[randomValues[i] % chars.length];
  }
  return `APT-${code}`;
}
