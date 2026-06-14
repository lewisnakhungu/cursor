import { describe, expect, it } from "vitest";
import {
  confidenceFromMatchScore,
  scoreCatalogMatch,
  type CatalogMatchMedicine,
} from "@/lib/catalog-match";

function med(
  partial: Partial<CatalogMatchMedicine> & Pick<CatalogMatchMedicine, "genericName">,
): CatalogMatchMedicine {
  const dosageForm = partial.dosageForm ?? "";
  const strength = partial.strength ?? "";
  return {
    dosageForm,
    strength,
    searchKey:
      partial.searchKey ??
      [partial.genericName, dosageForm, strength]
        .join("|")
        .toLowerCase()
        .replace(/[^a-z0-9|]+/g, " "),
    aliases: partial.aliases ?? [],
    ...partial,
  };
}

const LOW = 45;

describe("scoreCatalogMatch — supplier delivery names (should match)", () => {
  it("matches CTX co-trimoxazole suspension to KEML oral liquid", () => {
    const medicine = med({
      genericName: "Co-trimoxazole (Sulfamethoxazole + Trimethoprim)",
      dosageForm: "Oral liquid",
      strength: "240mg/5mL [c]",
      aliases: [{ name: "Septrin Suspension" }],
    });

    expect(
      scoreCatalogMatch("CTX (Co-trimoxazole) Suspension 240mg/5ml", medicine),
    ).toBeGreaterThanOrEqual(LOW);
  });

  it("matches Brufen-labelled ibuprofen syrup", () => {
    const medicine = med({
      genericName: "Ibuprofen",
      dosageForm: "Oral liquid",
      strength: "100mg/5mL [c]",
      aliases: [{ name: "Brufen Syrup" }],
    });

    expect(
      scoreCatalogMatch("Brufen (Ibuprofen) Syrup 100mg/5ml", medicine),
    ).toBeGreaterThanOrEqual(LOW);
  });

  it("matches PCM-labelled paracetamol syrup", () => {
    const medicine = med({
      genericName: "Paracetamol",
      dosageForm: "Oral liquid",
      strength: "120mg/5mL [c]",
      aliases: [{ name: "PCM Syrup" }],
    });

    expect(
      scoreCatalogMatch("PCM (Paracetamol) Syrup 120mg/5ml", medicine),
    ).toBeGreaterThanOrEqual(LOW);
  });

  it("matches syringes to consumable catalog row", () => {
    const medicine = med({
      genericName: "Disposable Syringe with Needle 5ml",
      aliases: [{ name: "Syringes 10cc (10ml) with Needles" }],
    });

    const score = scoreCatalogMatch(
      "Syringes 10cc (10ml) with Needles",
      medicine,
    );
    expect(score).toBeGreaterThanOrEqual(LOW);
    expect(confidenceFromMatchScore(score)).not.toBe("NONE");
  });

  it("matches artemether injection", () => {
    const medicine = med({
      genericName: "Artemether",
      dosageForm: "Injection (oily, IM)",
      strength: "80mg/mL in1mL amp",
    });

    const score = scoreCatalogMatch(
      "Artemether Injection 80mg/ml (Refill Lot)",
      medicine,
    );
    expect(confidenceFromMatchScore(score)).toBe("HIGH");
  });

  it("matches fluconazole capsules to capsule formulation", () => {
    const medicine = med({
      genericName: "Fluconazole",
      dosageForm: "Capsule",
      strength: "200mg",
    });

    const score = scoreCatalogMatch(
      "Fluconazole Capsules 200mg (Refill Lot)",
      medicine,
    );
    expect(confidenceFromMatchScore(score)).toBe("HIGH");
  });

  it("matches erythromycin suspension 125mg to oral liquid", () => {
    const medicine = med({
      genericName: "Erythromycin",
      dosageForm: "Oral liquid",
      strength: "125mg/5mL [c]",
    });

    expect(
      scoreCatalogMatch("Erythromycin Oral Suspension 125mg/5ml", medicine),
    ).toBeGreaterThanOrEqual(LOW);
  });
});

describe("scoreCatalogMatch — false positives (must not match)", () => {
  it("rejects syringes matched to ethanol injection", () => {
    const medicine = med({
      genericName: "Ethanol",
      dosageForm: "Injection",
      strength: "100% (1omL amp)",
    });

    expect(
      scoreCatalogMatch("Syringes 10cc (10ml) with Needles", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects celestamine tablets matched to betamethasone ointment", () => {
    const medicine = med({
      genericName: "Betamethasone",
      dosageForm: "Ointment",
      strength: "0.1% (as valerate)",
    });

    expect(
      scoreCatalogMatch(
        "Celestamine Tablets (Betamethasone + Dexchlorpheniramine)",
        medicine,
      ),
    ).toBeLessThan(LOW);
  });

  it("rejects nystatin drops matched to polio vaccine", () => {
    const medicine = med({
      genericName: "Polio vaccine, oral (OPV) (live attenuated)",
      dosageForm: "Oral",
      strength: "21.3.",
    });

    expect(
      scoreCatalogMatch("Nystatin Oral Drops 100,000 UI/ml (12ml)", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects nystatin suspension matched to paracetamol vial", () => {
    const medicine = med({
      genericName: "Paracetamol",
      dosageForm: "vial",
      strength: "10mg/mL (1oomL )",
    });

    expect(
      scoreCatalogMatch("Nystatin Oral Suspension (30ml)", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects erythromycin suspension 125mg matched to 250mg tablet", () => {
    const medicine = med({
      genericName: "Erythromycin",
      dosageForm: "Tablet",
      strength: "250mg",
    });

    expect(
      scoreCatalogMatch("Erythromycin Oral Suspension 125mg/5ml", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects cough syrup matched to diphenhydramine injection", () => {
    const medicine = med({
      genericName: "Diphenhydramine",
      dosageForm: "Injection",
      strength: "50mg/mL",
    });

    expect(
      scoreCatalogMatch("Good Morning Cough Syrup", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects acyclovir tablets matched to ORS sachet", () => {
    const medicine = med({
      genericName: "Oral rehydration salts (ORS)",
      dosageForm: "Sachet (WHO low-",
      strength: "",
    });

    expect(
      scoreCatalogMatch("Acyclovir Tablets 400mg (30 Tabs per Pack)", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects griseofulvin 500mg matched to 125mg", () => {
    const medicine = med({
      genericName: "Griseofulvin",
      dosageForm: "Tablet",
      strength: "125mg",
    });

    expect(
      scoreCatalogMatch("Griseofulvin Tablets 500mg", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects fluconazole capsules matched to oral liquid 50mg", () => {
    const medicine = med({
      genericName: "Fluconazole",
      dosageForm: "Oral liquid",
      strength: "50mg/5mL",
    });

    expect(
      scoreCatalogMatch("Fluconazole Capsules 200mg (Refill Lot)", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects diclofenac injection matched to paracetamol vial", () => {
    const medicine = med({
      genericName: "Paracetamol",
      dosageForm: "vial",
      strength: "10mg/mL (1oomL )",
    });

    expect(
      scoreCatalogMatch("Diclofenac Sodium Injection 75mg/3ml", medicine),
    ).toBeLessThan(LOW);
  });

  it("rejects cetirizine syrup matched to liquid paraffin", () => {
    const medicine = med({
      genericName: "Liquid paraffin",
      dosageForm: "Nasal drops",
      strength: "100%",
    });

    expect(
      scoreCatalogMatch("Cetirizine 5mg/5ml Syrup", medicine),
    ).toBeLessThan(LOW);
  });
});
