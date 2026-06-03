import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  PackagePlus,
  Shield,
  ShoppingCart,
  Timer,
  Users,
} from "lucide-react";
import { AfyaSmartLogo } from "@/components/brand/afyasmart-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "hello@afyasmart.local";

const FEATURES = [
  {
    icon: PackagePlus,
    title: "Receive & count stock",
    description:
      "Log batches with expiry dates, suppliers, and counting units (tablets, boxes, strips) so reports stay honest.",
  },
  {
    icon: ShoppingCart,
    title: "Dispense (POS)",
    description:
      "FEFO batch picking, in-stock catalog search, and priced sale lines — built for busy dispensary counters.",
  },
  {
    icon: Timer,
    title: "Expiry & low-stock alerts",
    description:
      "See what expires in 90 days, what is critical in 30, and what needs restock before you lose margin.",
  },
  {
    icon: Users,
    title: "Roles per facility",
    description:
      "Owner, deputy, and dispenser accounts with the right screens — no shared passwords on one login.",
  },
  {
    icon: Building2,
    title: "Multi-facility ready",
    description:
      "Owners with more than one site can switch branch context and keep stock isolated per pharmacy.",
  },
  {
    icon: Shield,
    title: "Audit-friendly sales",
    description:
      "Every dispense is logged with batch snapshots; corrections stay on the record with a reason.",
  },
] as const;

const STEPS = [
  "Pilot your facility — we help you load catalog and first batches.",
  "Train staff on receive and dispense (installable on phone or tablet).",
  "Review daily sales and expiry dashboard; scale to more branches when ready.",
] as const;

export function LandingPage() {
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("AfyaSmart-Stock demo request")}`;

  return (
    <div className="min-h-screen bg-[hsl(var(--shell-bg))]">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <AfyaSmartLogo size={36} />
            <span className="truncate text-sm font-semibold tracking-tight">
              AfyaSmart-Stock
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2">
            <a
              href="#features"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden sm:inline-flex",
              )}
            >
              Features
            </a>
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Staff login
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-border/60 bg-gradient-to-b from-background to-[hsl(var(--shell-bg))] px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              Pharmacy stock &amp; dispense for Kenyan facilities
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Know what you have, sell what is safe, trace every dispense
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              AfyaSmart-Stock connects KEML-aligned medicines to real batch
              stock, FEFO dispensing, and facility-level reporting — so owners
              and staff stop guessing between the shelf and the till.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={mailto}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-11 w-full gap-2 sm:w-auto",
                )}
              >
                Request a demo
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "min-h-11 w-full sm:w-auto",
                )}
              >
                Staff sign in
              </Link>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6"
        >
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Built for pharmacy operations
            </h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Not a generic POS — stock units, expiry, and tenant isolation are
              first-class.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <article
                  key={f.title}
                  className="rounded-xl border border-border/80 bg-card p-5 shadow-sm"
                >
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {f.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border/60 bg-card px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                From pilot to daily use
              </h2>
              <p className="mt-2 text-muted-foreground">
                Start with one facility. Add staff, receive stock, and dispense
                the same day — install on the home screen as a PWA for counter
                phones.
              </p>
              <ol className="mt-6 space-y-4">
                {STEPS.map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-border/80 bg-[hsl(var(--shell-bg))] p-6">
              <div className="flex items-center gap-2 text-primary">
                <BarChart3 className="size-5" aria-hidden />
                <span className="text-sm font-semibold">Operations snapshot</span>
              </div>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li>Dashboard: expiry queue, low stock, active batches</li>
                <li>Sales: today&apos;s revenue and top movers</li>
                <li>Insights &amp; printable weekly / monthly reports</li>
                <li>Platform admin for multi-facility oversight (partners)</li>
              </ul>
              <Link
                href="/login"
                className={cn(
                  buttonVariants(),
                  "mt-6 w-full sm:w-auto",
                )}
              >
                Open staff app
              </Link>
            </div>
          </div>
        </section>

        <section
          id="contact"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 text-center sm:px-6"
        >
          <h2 className="text-2xl font-semibold tracking-tight">
            Ready for a pilot pharmacy?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Tell us your facility name and size. We&apos;ll walk you through
            receive, dispense, and owner dashboards.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={mailto} className={buttonVariants({ size: "lg" })}>
              Email {CONTACT_EMAIL}
            </a>
            <Link
              href="/login"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Staff login
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-background px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} AfyaSmart-Stock. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground">
              Staff login
            </Link>
            <a href={mailto} className="hover:text-foreground">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
