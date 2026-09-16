import { AppShell } from "@/components/layout/app-shell";
import { getInventoryOverview } from "@/lib/actions/inventory";
import { InventoryView } from "@/components/inventory/inventory-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default async function InventoryPage() {
  const result = await getInventoryOverview();

  if (!result.success) {
    return (
      <AppShell
        title="Inventory"
        subtitle="Medicines, on-hand batch stock, and FEFO pull order"
      >
        <Alert variant="destructive">
          <AlertTitle>Inventory unavailable</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Inventory"
      subtitle="Medicines, on-hand batch stock, and FEFO pull order"
    >
      <InventoryView initialData={result.data} />
    </AppShell>
  );
}
