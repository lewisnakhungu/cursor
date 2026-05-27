import { cn } from "@/lib/utils";

type AfyaSmartLogoProps = {
  size?: number;
  className?: string;
  /** Show on primary-colored backgrounds (sidebar tile). */
  variant?: "default" | "onPrimary";
};

/**
 * AfyaSmart mark: rounded tile + medical cross + pill dot (pharmacy stock).
 */
export function AfyaSmartLogo({
  size = 36,
  className,
  variant = "default",
}: AfyaSmartLogoProps) {
  const tileFill =
    variant === "onPrimary" ? "currentColor" : "hsl(158 64% 32%)";
  const markFill =
    variant === "onPrimary" ? "hsl(var(--primary-foreground))" : "#ffffff";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        fill={tileFill}
      />
      <path
        d="M15 9h2v6h6v2h-6v6h-2v-6H9v-2h6V9z"
        fill={markFill}
      />
      <circle cx="23" cy="23" r="3.5" fill={markFill} opacity="0.92" />
    </svg>
  );
}
