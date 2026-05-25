export function formatKes(amount: number | string): string {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return "KES 0.00";
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(value);
}

export function decimalToNumber(
  value: { toString(): string } | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  return Number.parseFloat(value.toString());
}
