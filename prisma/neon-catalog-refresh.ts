/**
 * Refresh catalog reference data on Neon (production-safe).
 * Uses DATABASE_URL from .env only — ignores .env.local localhost.
 *
 *   npm run db:neon:catalog
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

run("Purge re-seedable catalog aliases", "npm run db:cleanup-catalog-aliases");
run("Full catalog ingestion", "npm run db:seed-catalog");

console.log("\n✓ Neon catalog refresh complete.");
