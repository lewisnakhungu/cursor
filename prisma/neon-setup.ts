/**
 * One-shot Neon / remote DB setup: push schema + seed catalog + aliases.
 * Uses DATABASE_URL from .env only (ignores .env.local local Postgres).
 *
 *   npm run db:neon:setup
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

const withUrl = `${url}${url.includes("?") ? "&" : "?"}connect_timeout=60`;
const env = { ...process.env, DATABASE_URL: withUrl, SEED_CHUNK_SIZE: "100" };

function run(label: string, cmd: string): void {
  console.log(`\n▶ ${label}`);
  execSync(cmd, { stdio: "inherit", env });
}

run("Schema push", "npx prisma db push");
run("KEML catalog", "npm run db:seed");
run("Brand aliases", "npm run db:seed-aliases");

console.log("\n✓ Neon setup complete.");
