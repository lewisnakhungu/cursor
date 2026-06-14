import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { getProcurementReorderCount } from "@/lib/actions/procurement";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export async function ProcurementDashboardCta() {
  const result = await getProcurementReorderCount();
  if (!result.success) return null;

  const { itemsNeedingReorder, draftOrders } = result.data;
  if (itemsNeedingReorder === 0 && draftOrders === 0) return null;

  return (
    <Alert className="rounded-xl border-primary/30 bg-primary/5">
      <PackageSearch className="size-5" />
      <AlertTitle>Procurement</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {itemsNeedingReorder > 0
            ? `${itemsNeedingReorder} medicine(s) below reorder point.`
            : null}
          {itemsNeedingReorder > 0 && draftOrders > 0 ? " " : null}
          {draftOrders > 0
            ? `${draftOrders} draft order(s) in progress.`
            : null}
        </span>
        <Link href="/procurement">
          <Button size="sm" variant="outline" className="bg-background">
            Open procurement
          </Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}
