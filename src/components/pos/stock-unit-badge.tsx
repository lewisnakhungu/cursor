import { Badge } from "@/components/ui/badge";
import {
  normalizeStockUnit,
  stockUnitMeta,
  type StockUnitCode,
} from "@/lib/stock-unit";
import { cn } from "@/lib/utils";

type StockUnitBadgeProps = {
  unit: StockUnitCode | string | null | undefined;
  unitsPerPack?: number | null;
  className?: string;
};

export function StockUnitBadge({
  unit,
  unitsPerPack,
  className,
}: StockUnitBadgeProps) {
  const code = normalizeStockUnit(unit);
  const meta = stockUnitMeta(code);

  return (
    <Badge variant="secondary" className={cn("font-normal", className)}>
      Count: {meta.label}
      {unitsPerPack != null && unitsPerPack > 1
        ? ` · ${unitsPerPack}/pack`
        : null}
    </Badge>
  );
}
