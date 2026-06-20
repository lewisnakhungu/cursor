import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Pharmacy stock & dispense`,
  description:
    "Batch stock, FEFO dispense, expiry alerts, and facility roles for Kenyan pharmacies.",
  openGraph: {
    title: BRAND_NAME,
    description: "Pharmacy stock and dispense management",
    type: "website",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
