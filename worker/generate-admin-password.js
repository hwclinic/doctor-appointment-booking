/* ==========================================================================
   Run this ONCE locally with Node.js to turn your chosen admin password
   into a salt + hash pair, which you then store as Cloudflare secrets.
   Your real password is never saved anywhere — only this scrambled form.

   How to run:
     node worker/generate-admin-password.js "YourChosenPassword123"

   Then copy the printed SALT and HASH and set them with:
     npx wrangler secret put ADMIN_PASSWORD_SALT
     npx wrangler secret put ADMIN_PASSWORD_HASH
     npx wrangler secret put ADMIN_USERNAME
     npx wrangler secret put SESSION_SECRET   (any long random string)
   ========================================================================== */

const crypto = require("crypto");

const password = process.argv[2];
if (!password) {
  console.error("Usage: node generate-admin-password.js <your-password>");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.pbkdf2Sync(password, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");

console.log("\nCopy these two values as Cloudflare secrets (see comment at top of this file):\n");
console.log("ADMIN_PASSWORD_SALT =", salt);
console.log("ADMIN_PASSWORD_HASH =", hash);
console.log("\nDo not commit these values or your real password to Git.\n");
