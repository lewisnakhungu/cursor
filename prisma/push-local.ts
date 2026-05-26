/**
 * Applies schema to local Postgres (.env.local only).
 * Run after pulling Insights changes: npm run db:push:local
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(1);
}

execSync("npx prisma db push", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});

execSync("npm run db:generate", { stdio: "inherit" });

console.log("\n✓ Local database schema updated.");
