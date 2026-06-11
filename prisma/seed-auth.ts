/**
 * Seeds platform super user and demo facility owners.
 *
 * Usage: npx tsx prisma/seed-auth.ts
 *
 * Defaults (override via env):
 *   SUPER_EMAIL=admin@afyasmart.local
 *   SUPER_PASSWORD=ChangeMeAdmin1!
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });
config({ path: ".env" });

const SUPER_EMAIL =
  process.env.SUPER_EMAIL?.trim().toLowerCase() ?? "admin@afyasmart.local";
const SUPER_PASSWORD = process.env.SUPER_PASSWORD ?? "ChangeMeAdmin1!";

const DEMO_OWNERS: Array<{
  tenantId: string;
  email: string;
  name: string;
  password: string;
}> = [
  {
    tenantId: "default",
    email: "owner@default.local",
    name: "Default Owner",
    password: "ChangeMeOwner1!",
  },
  {
    tenantId: "facility-a",
    email: "owner@kakamega.local",
    name: "Kakamega Owner",
    password: "ChangeMeOwner1!",
  },
];

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const superHash = await bcrypt.hash(SUPER_PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: SUPER_EMAIL },
      create: {
        email: SUPER_EMAIL,
        name: "Platform Admin",
        passwordHash: superHash,
        isPlatformAdmin: true,
        // Seeded default credentials must be replaced at first sign-in (SS3)
        mustChangePassword: true,
      },
      update: {
        passwordHash: superHash,
        isPlatformAdmin: true,
        mustChangePassword: true,
      },
    });
    console.log(`✓ Super user: ${SUPER_EMAIL}`);

    for (const demo of DEMO_OWNERS) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: demo.tenantId },
      });
      if (!tenant) {
        console.log(`  skip ${demo.email} — tenant ${demo.tenantId} missing`);
        continue;
      }

      const hash = await bcrypt.hash(demo.password, 12);
      const user = await prisma.user.upsert({
        where: { email: demo.email },
        create: {
          email: demo.email,
          name: demo.name,
          passwordHash: hash,
          isPlatformAdmin: false,
          mustChangePassword: true,
        },
        update: { name: demo.name, passwordHash: hash, mustChangePassword: true },
      });

      await prisma.membership.upsert({
        where: {
          tenantId_userId: { tenantId: demo.tenantId, userId: user.id },
        },
        create: {
          tenantId: demo.tenantId,
          userId: user.id,
          role: "OWNER",
        },
        update: { role: "OWNER" },
      });

      console.log(`✓ Owner ${demo.email} → ${tenant.name}`);
    }

    console.log("\nSign in at /login with the emails above.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
