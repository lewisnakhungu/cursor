/**
 * Seeds ~80 high-volume Kenya pharmacy stock batches against KEML catalog rows.
 * Run after: npm run db:seed
 */
import { config } from "dotenv";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const DEFAULT_TENANT_ID = process.env.TENANT_ID?.trim() || "default";

/** Curated generics aligned to Kenya essential / high-turnover medicines (KEML names). */
const COMMON_KENYA_GENERICS: readonly string[] = [
  "Paracetamol",
  "Amoxicillin",
  "Metformin",
  "Artemether + lumefantrine (AL)",
  "Artesunate",
  "Quinine",
  "Sulfadoxine + Pyrimethamine",
  "Oxytocin",
  "Misoprostol",
  "Ergometrine",
  "Magnesium sulphate",
  "Tranexamic acid",
  "Salbutamol",
  "Ceftriaxone",
  "Benzathine benzylpenicillin",
  "Benzylpenicillin",
  "Cotrimoxazole (Sulfamethoxazole + Trimethoprim)",
  "Metronidazole",
  "Ciprofloxacin",
  "Azithromycin",
  "Doxycycline",
  "Erythromycin",
  "Tetracycline",
  "Gentamicin",
  "Albendazole",
  "Praziquantel",
  "Oral rehydration salts (ORS)",
  "Zinc sulphate",
  "Ferrous salt",
  "Folic acid",
  "Retinol (Vit A)",
  "Chlorhexidine",
  "Fluconazole",
  "Nystatin",
  "Clotrimazole",
  "Acyclovir",
  "Amlodipine",
  "Enalapril",
  "Losartan",
  "Hydrochlorothiazide (HCTZ)",
  "Furosemide",
  "Propranolol",
  "Nifedipine",
  "Labetalol",
  "Metoclopramide",
  "Omeprazole",
  "Ondansetron",
  "Ibuprofen",
  "Acetylsalicylic acid (Aspirin)",
  "Diazepam",
  "Haloperidol",
  "Chlorpromazine",
  "Morphine",
  "Tramadol",
  "Epinephrine (adrenaline)",
  "Atropine",
  "Adrenaline",
  "Dexamethasone",
  "Prednisolone",
  "Hydrocortisone",
  "Lidocaine (Lignocaine)",
  "Ketamine",
  "Sodium chloride",
  "Glucose",
  "Potassium chloride",
  "Calcium carbonate",
  "Insulin, Short acting (Regular) (Human)",
  "Tenofovir disoproxil fumarate + Lamivudine + Dolutegravir (TDF+3TC+DTG)",
  "Dolutegravir (DTG)",
  "Lamivudine (3TC)",
  "Nevirapine (NVP)",
  "Zidovudine (AZT or ZDV)",
  "Rifampicin (R)",
  "Isoniazid (H)",
  "Rifampicin + Isoniazid (RH)",
  "Phenytoin sodium",
  "Carbamazepine",
  "Phenobarbital",
  "Sodium valproate (valproic acid)",
  "Naloxone",
  "Flumazenil",
  "Ww Warfarin",
  "Clopidogrel",
  "Bendroflumethiazide",
  "Vitamin B complex",
  "Thiamine",
  "Sodium lactate compound (Hartmann’s /Ringers lactate)",
  "Glucose",
  "Bisoprolol",
  "Vitamin C (Ascorbic acid)",
  "Ivermectin",
  "Chloroquine",
  "Co-trimoxazole (Sulfamethoxazole + Trimethoprim)",
  "Amoxicillin + clavulanic acid",
  "Artemether",
  "Zinc sulphate",
];

type BatchTemplate = {
  quantityOnHand: number;
  monthsUntilExpiry: number;
  supplierCost: number;
  retailSalePrice: number;
  batchSuffix: string;
};

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function pickBatchTemplates(index: number): BatchTemplate[] {
  const tier = index % 3;
  if (tier === 0) {
    return [
      {
        quantityOnHand: 240,
        monthsUntilExpiry: 14,
        supplierCost: 4.5,
        retailSalePrice: 8,
        batchSuffix: "A",
      },
      {
        quantityOnHand: 120,
        monthsUntilExpiry: 8,
        supplierCost: 4.2,
        retailSalePrice: 7.5,
        batchSuffix: "B",
      },
    ];
  }
  if (tier === 1) {
    return [
      {
        quantityOnHand: 80,
        monthsUntilExpiry: 10,
        supplierCost: 12,
        retailSalePrice: 22,
        batchSuffix: "A",
      },
    ];
  }
  return [
    {
      quantityOnHand: 360,
      monthsUntilExpiry: 18,
      supplierCost: 2.8,
      retailSalePrice: 5,
      batchSuffix: "A",
    },
  ];
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let matched = 0;
  let batchesCreated = 0;
  const missing: string[] = [];

  try {
    await prisma.tenant.upsert({
      where: { id: DEFAULT_TENANT_ID },
      create: {
        id: DEFAULT_TENANT_ID,
        name: "Default Facility",
        slug: "default",
      },
      update: {},
    });

    for (let i = 0; i < COMMON_KENYA_GENERICS.length; i++) {
      const genericName = COMMON_KENYA_GENERICS[i];

      const medicine = await prisma.medicine.findFirst({
        where: {
          genericName,
          isStub: false,
          dosageForm: { not: "" },
          strength: { not: "" },
        },
        orderBy: [{ dosageForm: "asc" }, { strength: "asc" }],
      }) ?? await prisma.medicine.findFirst({
        where: { genericName, isStub: false },
        orderBy: [{ dosageForm: "asc" }, { strength: "asc" }],
      });

      if (!medicine) {
        const fallback = await prisma.medicine.findFirst({
          where: {
            genericName: { contains: genericName.split(" ")[0], mode: "insensitive" },
            isStub: false,
          },
          orderBy: { genericName: "asc" },
        });
        if (!fallback) {
          missing.push(genericName);
          continue;
        }
        await createBatchesForMedicine(
          prisma,
          fallback,
          i,
          today,
          (n) => {
            batchesCreated += n;
          },
        );
        matched++;
        continue;
      }

      await createBatchesForMedicine(prisma, medicine, i, today, (n) => {
        batchesCreated += n;
      });
      matched++;
    }

    const totalBatches = await prisma.stockBatch.count();

    console.log(
      JSON.stringify(
        {
          targetGenerics: COMMON_KENYA_GENERICS.length,
          medicinesStocked: matched,
          batchesCreatedThisRun: batchesCreated,
          totalBatchesInDb: totalBatches,
          missingGenericNames: missing,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function createBatchesForMedicine(
  prisma: PrismaClient,
  medicine: { id: string; genericName: string },
  index: number,
  today: Date,
  onCreated: (count: number) => void,
): Promise<void> {
  const year = today.getFullYear();
  const templates = pickBatchTemplates(index);
  let created = 0;

  for (const template of templates) {
    const existing = await prisma.stockBatch.findFirst({
      where: {
        tenantId: DEFAULT_TENANT_ID,
        medicineId: medicine.id,
        batchNumber: `KE-${year}-${String(index + 1).padStart(3, "0")}-${template.batchSuffix}`,
      },
    });

    if (existing) continue;

    await prisma.stockBatch.create({
      data: {
        tenantId: DEFAULT_TENANT_ID,
        stockUnit: "TABLET",
        medicineId: medicine.id,
        batchNumber: `KE-${year}-${String(index + 1).padStart(3, "0")}-${template.batchSuffix}`,
        quantityOnHand: template.quantityOnHand,
        expiryDate: addMonths(today, template.monthsUntilExpiry),
        supplierCost: new Prisma.Decimal(template.supplierCost),
        retailSalePrice: new Prisma.Decimal(template.retailSalePrice),
        receivedAt: addMonths(today, -1),
      },
    });
    created++;
  }

  onCreated(created);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
