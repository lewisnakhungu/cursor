import { AppShell } from "@/components/layout/app-shell";
import { CatalogReviewPanel } from "@/components/admin/catalog-review-panel";
import { Button } from "@/components/ui/button";

export default function AdminCatalogPage() {
  return (
    <AppShell
      title="Catalog administration"
      subtitle="Review learned supplier names and alias proposals"
    >
      <div className="mb-6">
        <Button variant="outline" size="sm" nativeButton={false} render={<a href="/admin" />}>
          ← Back to facilities
        </Button>
      </div>
      <CatalogReviewPanel />
    </AppShell>
  );
}
