import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "critical" | "success";
  icon?: React.ReactNode;
};

const toneStyles = {
  default: "border-border/80 bg-card",
  warning: "border-amber-200/80 bg-amber-50/50",
  critical: "border-destructive/20 bg-destructive/5",
  success: "border-emerald-200/80 bg-emerald-50/40",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md",
        toneStyles[tone],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon && (
          <span className="text-muted-foreground" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}
