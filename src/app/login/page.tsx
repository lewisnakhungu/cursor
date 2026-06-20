import { Suspense } from "react";
import { AfyaStockLogo } from "@/components/brand/afyastock-logo";
import { LoginForm } from "@/components/auth/login-form";
import { BRAND_NAME } from "@/lib/brand";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--shell-bg))] px-4">
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center">
            <AfyaStockLogo size={56} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {BRAND_NAME}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your facility account
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
