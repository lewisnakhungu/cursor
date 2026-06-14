/**
 * Seed KEMSA aliases on Neon — uses DATABASE_URL from .env only.
 *
 *   npm run db:neon:seed-kemsa
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env", override: true });

const url = process.env.DATABASE_URL;
if (!url || url.includes("localhost")) {
  console.error(
    "Set DATABASE_URL in .env to your Neon pooled URL (not localhost).",
  );
  process.exit(1);
}

const withUrl = `${url}${url.includes("?") ? "&" : "?"}connect_timeout=120`;
const env = { ...process.env, DATABASE_URL: withUrl, SEED_CHUNK_SIZE: "50" };

console.log("Target:", url.match(/@([^/]+)/)?.[1] ?? "unknown");
console.log("\n▶ KEMSA aliases (this takes ~3–4 minutes)…\n");

execSync("npm run db:seed-kemsa", { stdio: "inherit", env });

console.log("\n✓ KEMSA seed complete on Neon.");
