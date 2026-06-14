/**
 * Full catalog ingestion pipeline — runs all reference-data seeds in order.
 *
 *   npm run db:seed-catalog
 *
 * Sources (in order):
 *   1. KEML 2023 formulary        (data/final_keml_2023.json)
 *   2. Brand alias index          (data/alias_names.json)
 *   3. Hybrid facility catalog    (docs/extended_hybrid_catalog.json)
 *   4. KEMSA public product list  (data/kemsa/kemsa_product_list.json)
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";

if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
  config({ path: ".env" });
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("DATABASE_URL is required");
}

const withUrl = `${dbUrl}${dbUrl.includes("?") ? "&" : "?"}connect_timeout=60`;
const childEnv = { ...process.env, DATABASE_URL: withUrl, SEED_CHUNK_SIZE: "100" };

function run(label: string, cmd: string): void {
  console.log(`\n▶ ${label}`);
  execSync(cmd, { stdio: "inherit", env: childEnv });
}

run("KEML 2023 formulary", "npm run db:seed");
run("Brand aliases", "npm run db:seed-aliases");
run("Hybrid facility catalog", "npm run db:seed-hybrid-catalog");
run("KEMSA product aliases", "npm run db:seed-kemsa");

console.log("\n✓ Full catalog ingestion complete.");
