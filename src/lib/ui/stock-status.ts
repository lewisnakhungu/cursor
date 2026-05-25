export type ExpiryRisk = "critical" | "high" | "watch" | "ok";

export function getExpiryRisk(daysUntilExpiry: number): ExpiryRisk {
  if (daysUntilExpiry <= 30) return "critical";
  if (daysUntilExpiry <= 60) return "high";
  if (daysUntilExpiry <= 90) return "watch";
  return "ok";
}

export function getExpiryRiskLabel(risk: ExpiryRisk): string {
  switch (risk) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "watch":
      return "Watch";
    default:
      return "OK";
  }
}

export function getExpiryBadgeVariant(
  risk: ExpiryRisk,
): "critical" | "warning" | "success" | "secondary" {
  switch (risk) {
    case "critical":
      return "critical";
    case "high":
    case "watch":
      return "warning";
    case "ok":
      return "success";
    default:
      return "secondary";
  }
}
