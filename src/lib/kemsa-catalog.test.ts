import { describe, expect, it } from "vitest";
import { parseKemsaCatalogText } from "./kemsa-catalog";

describe("parseKemsaCatalogText", () => {
  it("parses product code, name, and pack size triplets", () => {
    const text = `
PHARMACEUTICAL PRODUCTS
PM05ASA003
Acetylsalicylic Acid Tablets 75mg-Enteric Coated Blister Pack
Pack of 30s
PM07ACE003
Acetazolamide Tablets 250mg
Pack of 30s
NON-PHARMACEUTICAL ITEMS
NM12ADH006
Alcohol Preinjection Swabs
Pack Of 200'S
`;

    const products = parseKemsaCatalogText(text);

    expect(products).toHaveLength(3);
    expect(products[0]).toMatchObject({
      productCode: "PM05ASA003",
      productName:
        "Acetylsalicylic Acid Tablets 75mg-Enteric Coated Blister Pack",
      packSize: "Pack of 30s",
      category: "PHARMACEUTICAL PRODUCTS",
    });
    expect(products[2]).toMatchObject({
      productCode: "NM12ADH006",
      productName: "Alcohol Preinjection Swabs",
      category: "NON-PHARMACEUTICAL ITEMS",
      codePrefix: "NM",
    });
  });

  it("inherits product name from same drug family when PDF omits name row", () => {
    const text = `
PHARMACEUTICAL PRODUCTS
PM03AMX015
Amoxicillin Capsules 500mg
100s in Blisters
PM01AMX015
Pack of 100s
`;

    const products = parseKemsaCatalogText(text);
    const amx015 = products.find((p) => p.productCode === "PM01AMX015");
    expect(amx015?.productName).toBe("Amoxicillin Capsules 500mg");
    expect(amx015?.packSize).toBe("Pack of 100s");
  });
});
