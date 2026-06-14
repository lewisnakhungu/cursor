"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { MedicineCatalogSearch } from "@/components/catalog/medicine-catalog-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteReorderPolicy,
  listReorderPolicies,
  upsertReorderPolicy,
} from "@/lib/actions/procurement-policies";
import type { CatalogMedicine, ReorderPolicyView } from "@/lib/types";

export function ReorderPolicyPanel() {
  const [policies, setPolicies] = useState<ReorderPolicyView[]>([]);
  const [selected, setSelected] = useState<CatalogMedicine | null>(null);
  const [reorderPoint, setReorderPoint] = useState("");
  const [targetLevel, setTargetLevel] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("14");
  const [safetyStockDays, setSafetyStockDays] = useState("3");
  const [loading, startLoad] = useTransition();

  const reload = useCallback(() => {
    startLoad(async () => {
      const response = await listReorderPolicies();
      if (response.success) setPolicies(response.data);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSave = () => {
    if (!selected) {
      toast.error("Select a medicine first");
      return;
    }
    startLoad(async () => {
      const response = await upsertReorderPolicy({
        medicineId: selected.id,
        reorderPoint:
          reorderPoint.trim() === ""
            ? null
            : Number.parseInt(reorderPoint, 10),
        targetLevel:
          targetLevel.trim() === "" ? null : Number.parseInt(targetLevel, 10),
        leadTimeDays: Number.parseInt(leadTimeDays, 10) || 14,
        safetyStockDays: Number.parseInt(safetyStockDays, 10) || 3,
      });
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Reorder rule saved");
      setSelected(null);
      setReorderPoint("");
      setTargetLevel("");
      reload();
    });
  };

  const handleDelete = (medicineId: string) => {
    startLoad(async () => {
      const response = await deleteReorderPolicy(medicineId);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Rule removed — defaults will apply");
      reload();
    });
  };

  return (
    <section className="pharmacy-panel space-y-4">
      <div>
        <h2 className="pharmacy-panel-title">Per-medicine reorder rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Override auto-calculated reorder points. Leave ROP/target blank to use
          sales velocity (30-day average × lead time + safety stock).
        </p>
      </div>

      <div className="rounded-lg border border-dashed p-4 space-y-3">
        <MedicineCatalogSearch
          variant="receive"
          onSelect={setSelected}
        />
        {selected ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium">Reorder point</label>
              <Input
                type="number"
                min={0}
                placeholder="Auto"
                className="mt-1"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Target level</label>
              <Input
                type="number"
                min={0}
                placeholder="Auto"
                className="mt-1"
                value={targetLevel}
                onChange={(e) => setTargetLevel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Lead time (days)</label>
              <Input
                type="number"
                min={1}
                className="mt-1"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Safety stock (days)</label>
              <Input
                type="number"
                min={0}
                className="mt-1"
                value={safetyStockDays}
                onChange={(e) => setSafetyStockDays(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        {selected ? (
          <Button onClick={handleSave} disabled={loading}>
            Save rule for {selected.genericName}
          </Button>
        ) : null}
      </div>

      {policies.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine</TableHead>
                <TableHead>ROP</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Lead time</TableHead>
                <TableHead>Safety</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.genericName}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.dosageForm} · {p.strength}
                    </div>
                  </TableCell>
                  <TableCell>{p.reorderPoint ?? "Auto"}</TableCell>
                  <TableCell>{p.targetLevel ?? "Auto"}</TableCell>
                  <TableCell>{p.leadTimeDays}d</TableCell>
                  <TableCell>{p.safetyStockDays}d</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(p.medicineId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No custom rules yet — the system uses 14-day lead time and 3-day
          safety stock from 30-day sales.
        </p>
      )}
    </section>
  );
}
