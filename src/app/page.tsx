import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata: Metadata = {
  title: "AfyaSmart-Stock — Pharmacy stock & dispense",
  description:
    "Batch stock, FEFO dispense, expiry alerts, and facility roles for Kenyan pharmacies.",
  openGraph: {
    title: "AfyaSmart-Stock",
    description: "Pharmacy stock and dispense management",
    type: "website",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
