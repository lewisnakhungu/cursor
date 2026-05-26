"use client";

import {
  STOCK_UNIT_OPTIONS,
  type StockUnitCode,
} from "@/lib/stock-unit";
import { cn } from "@/lib/utils";

type StockUnitSelectProps = {
  id?: string;
  value: StockUnitCode;
  onChange: (value: StockUnitCode) => void;
  disabled?: boolean;
  className?: string;
};

export function StockUnitSelect({
  id = "stock-unit",
  value,
  onChange,
  disabled,
  className,
}: StockUnitSelectProps) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as StockUnitCode)}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {STOCK_UNIT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
