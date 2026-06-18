"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Download,
  PackageSearch,
  Plus,
  Printer,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { MedicineCatalogSearch } from "@/components/catalog/medicine-catalog-search";
import { ProcurementOrderDocument } from "@/components/procurement/procurement-order-document";
import { ProcurementImportForm } from "@/components/procurement/procurement-import-form";
import { ReorderPolicyPanel } from "@/components/procurement/reorder-policy-panel";
import { SupplierManager } from "@/components/procurement/supplier-manager";
import { ProcurementVariancePanel } from "@/components/procurement/procurement-variance-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StockUnitSelect } from "@/components/ui/stock-unit-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addProcurementLine,
  deleteProcurementOrder,
  generateReorderDraft,
  getProcurementOrder,
  getProcurementReport,
  listProcurementOrders,
  removeProcurementLine,
  submitProcurementOrder,
  updateProcurementOrder,
} from "@/lib/actions/procurement";
import { listSuppliers } from "@/lib/actions/suppliers";
import { downloadCsv, procurementOrderCsv } from "@/lib/csv";
import {
  formatQuantityWithUnit,
  stockUnitMeta,
  suggestStockUnitFromDosageForm,
  type StockUnitCode,
} from "@/lib/stock-unit";
import type {
  CatalogMedicine,
  ProcurementOrderDetail,
  ProcurementOrderSummary,
  ProcurementReportData,
  SupplierView,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type TabId = "orders" | "policies" | "suppliers" | "variance";

function statusVariant(
  status: ProcurementOrderSummary["status"],
): "default" | "success" | "warning" | "critical" {
  switch (status) {
    case "DRAFT":
      return "default";
    case "SUBMITTED":
      return "warning";
    case "PARTIALLY_RECEIVED":
      return "warning";
    case "CLOSED":
      return "success";
    default:
      return "default";
  }
}

export function ProcurementWorkspace() {
  const [tab, setTab] = useState<TabId>("orders");
  const [orders, setOrders] = useState<ProcurementOrderSummary[]>([]);
  const [active, setActive] = useState<ProcurementOrderDetail | null>(null);
  const [report, setReport] = useState<ProcurementReportData | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierView[]>([]);
  const [notes, setNotes] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [lineEdits, setLineEdits] = useState<
    Record<string, { orderedQty: number; priority: string; notes: string }>
  >({});
  const [addMedicine, setAddMedicine] = useState<CatalogMedicine | null>(null);
  const [addQty, setAddQty] = useState("");
  const [addUnit, setAddUnit] = useState<StockUnitCode>("UNIT");
  const [loading, startLoad] = useTransition();

  const reloadOrders = useCallback(() => {
    startLoad(async () => {
      const [orderRes, supplierRes] = await Promise.all([
        listProcurementOrders(),
        listSuppliers(),
      ]);
      if (orderRes.success) setOrders(orderRes.data);
      if (supplierRes.success) setSuppliers(supplierRes.data);
    });
  }, []);

  const loadOrder = useCallback((orderId: string) => {
    startLoad(async () => {
      const response = await getProcurementOrder(orderId);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setActive(response.data);
      setNotes(response.data.notes ?? "");
      setSupplierName(response.data.supplierName ?? "");
      setSupplierId(response.data.supplierId ?? "");
      setLineEdits(
        Object.fromEntries(
          response.data.lines.map((l) => [
            l.id,
            {
              orderedQty: l.orderedQty,
              priority: l.priority,
              notes: l.notes ?? "",
            },
          ]),
        ),
      );
      setReport(null);
    });
  }, []);

  useEffect(() => {
    reloadOrders();
  }, [reloadOrders]);

  useEffect(() => {
    if (addMedicine) {
      setAddUnit(suggestStockUnitFromDosageForm(addMedicine.dosageForm));
    }
  }, [addMedicine]);

  const handleGenerate = () => {
    startLoad(async () => {
      const response = await generateReorderDraft({
        supplierName: supplierName || undefined,
        supplierId: supplierId || undefined,
      });
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Reorder draft created");
      reloadOrders();
      loadOrder(response.data.orderId);
    });
  };

  const handleSave = () => {
    if (!active) return;
    startLoad(async () => {
      const response = await updateProcurementOrder({
        orderId: active.id,
        notes: notes || null,
        supplierName: supplierName || null,
        supplierId: supplierId || null,
        lines: active.lines.map((l) => ({
          lineId: l.id,
          orderedQty: lineEdits[l.id]?.orderedQty ?? l.orderedQty,
          priority: (lineEdits[l.id]?.priority ?? l.priority) as "HIGH" | "NORMAL",
          notes: lineEdits[l.id]?.notes || null,
        })),
      });
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Draft saved");
      loadOrder(active.id);
    });
  };

  const handleSubmit = () => {
    if (!active) return;
    startLoad(async () => {
      const save = await updateProcurementOrder({
        orderId: active.id,
        notes: notes || null,
        supplierName: supplierName || null,
        supplierId: supplierId || null,
        lines: active.lines.map((l) => ({
          lineId: l.id,
          orderedQty: lineEdits[l.id]?.orderedQty ?? l.orderedQty,
          priority: (lineEdits[l.id]?.priority ?? l.priority) as "HIGH" | "NORMAL",
          notes: lineEdits[l.id]?.notes || null,
        })),
      });
      if (!save.success) {
        toast.error(save.error);
        return;
      }
      const response = await submitProcurementOrder(active.id);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Order submitted — ready to print and send");
      reloadOrders();
      loadOrder(active.id);
    });
  };

  const handleDelete = () => {
    if (!active || active.status !== "DRAFT") return;
    startLoad(async () => {
      const response = await deleteProcurementOrder(active.id);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Draft deleted");
      setActive(null);
      setReport(null);
      reloadOrders();
    });
  };

  const handlePrint = () => {
    if (!active) return;
    startLoad(async () => {
      const response = await getProcurementReport(active.id);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setReport(response.data);
      requestAnimationFrame(() => window.print());
    });
  };

  const handleExportCsv = () => {
    if (!report && !active) return;
    startLoad(async () => {
      let data = report;
      if (!data && active) {
        const response = await getProcurementReport(active.id);
        if (!response.success) {
          toast.error(response.error);
          return;
        }
        data = response.data;
        setReport(data);
      }
      if (!data) return;
      downloadCsv(
        `procurement-${data.reference}.csv`,
        procurementOrderCsv(data),
      );
      toast.success("CSV downloaded");
    });
  };

  const handleRemoveLine = (lineId: string) => {
    if (!active || active.status !== "DRAFT") return;
    startLoad(async () => {
      const response = await removeProcurementLine(lineId);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      loadOrder(active.id);
    });
  };

  const handleAddLine = () => {
    if (!active || !addMedicine) {
      toast.error("Select a medicine from the catalog");
      return;
    }
    const qty = Number.parseInt(addQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a valid order quantity");
      return;
    }
    startLoad(async () => {
      const response = await addProcurementLine({
        orderId: active.id,
        medicineId: addMedicine.id,
        orderedQty: qty,
        stockUnit: addUnit,
        reason: "NEW_ITEM",
      });
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Line added");
      setAddMedicine(null);
      setAddQty("");
      loadOrder(active.id);
    });
  };

  const isDraft = active?.status === "DRAFT";

  return (
    <>
      <div className="print:hidden space-y-6">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["orders", "Orders"],
              ["policies", "Reorder rules"],
              ["suppliers", "Suppliers"],
              ["variance", "Order vs received"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              variant={tab === id ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {tab === "policies" ? <ReorderPolicyPanel /> : null}
        {tab === "suppliers" ? <SupplierManager onChanged={reloadOrders} /> : null}
        {tab === "variance" ? <ProcurementVariancePanel /> : null}

        {tab === "orders" ? (
          <>
            <section className="pharmacy-panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="pharmacy-panel-title flex items-center gap-2">
                    <PackageSearch className="size-4" />
                    Procurement orders
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Auto-suggest low-stock items, edit quantities, add new
                    medicines, then print a requisition for your supplier.
                  </p>
                </div>
                <Button
                  className="min-h-11"
                  disabled={loading}
                  onClick={handleGenerate}
                >
                  <Plus className="mr-2 size-4" />
                  Generate reorder list
                </Button>
              </div>

              {orders.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Lines</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow
                          key={order.id}
                          className={cn(
                            "cursor-pointer",
                            active?.id === order.id && "bg-muted/50",
                          )}
                          onClick={() => loadOrder(order.id)}
                        >
                          <TableCell className="font-mono text-sm">
                            {order.reference}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(order.status)}>
                              {order.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{order.lineCount}</TableCell>
                          <TableCell>{order.supplierName ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(order.createdAt).toLocaleDateString("en-KE")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No orders yet. Generate a reorder list from current stock and
                  sales velocity, or import a partner CSV / Excel / photo below.
                </p>
              )}
            </section>

            <ProcurementImportForm
              orderId={active?.id ?? null}
              orderIsDraft={active?.status === "DRAFT"}
              onImported={(orderId) => {
                reloadOrders();
                loadOrder(orderId);
              }}
              disabled={loading}
            />

            {active ? (
              <section className="pharmacy-panel space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">{active.reference}</h2>
                    <Badge variant={statusVariant(active.status)} className="mt-1">
                      {active.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isDraft ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loading}
                          onClick={handleSave}
                        >
                          <Save className="mr-2 size-4" />
                          Save draft
                        </Button>
                        <Button
                          size="sm"
                          disabled={loading}
                          onClick={handleSubmit}
                        >
                          <Send className="mr-2 size-4" />
                          Submit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={loading}
                          onClick={handleDelete}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={handleExportCsv}
                    >
                      <Download className="mr-2 size-4" />
                      CSV
                    </Button>
                    <Button size="sm" disabled={loading} onClick={handlePrint}>
                      <Printer className="mr-2 size-4" />
                      Print
                    </Button>
                    {!isDraft ? (
                      <Link href="/receive">
                        <Button variant="secondary" size="sm">
                          Receive stock
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Supplier</label>
                    {suppliers.length > 0 ? (
                      <select
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={supplierId}
                        disabled={!isDraft}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSupplierId(id);
                          const s = suppliers.find((x) => x.id === id);
                          if (s) setSupplierName(s.name);
                        }}
                      >
                        <option value="">Select supplier…</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.isDefault ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <Input
                      className="mt-2"
                      placeholder="Supplier name for printout"
                      value={supplierName}
                      disabled={!isDraft}
                      onChange={(e) => setSupplierName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Notes</label>
                    <Input
                      className="mt-1"
                      placeholder="Delivery instructions, contact, etc."
                      value={notes}
                      disabled={!isDraft}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>On hand</TableHead>
                        <TableHead>ROP</TableHead>
                        <TableHead>Days left</TableHead>
                        <TableHead>ABC</TableHead>
                        <TableHead>Suggested</TableHead>
                        <TableHead>Order qty</TableHead>
                        <TableHead>Priority</TableHead>
                        {isDraft ? <TableHead /> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {active.lines.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={isDraft ? 9 : 8}
                            className="text-center text-muted-foreground"
                          >
                            No lines — add medicines below or regenerate when stock
                            is low.
                          </TableCell>
                        </TableRow>
                      ) : (
                        active.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>
                              <div className="font-medium">{line.genericName}</div>
                              <div className="text-xs text-muted-foreground">
                                {line.dosageForm} · {line.strength}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {stockUnitMeta(line.stockUnit).label}
                                {line.reason !== "LOW_STOCK"
                                  ? ` · ${line.reason.replace("_", " ").toLowerCase()}`
                                  : null}
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {line.sourceMeta?.currentStock ?? "—"}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {line.sourceMeta?.reorderPoint ?? "—"}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {line.sourceMeta?.daysOfStockLeft ?? "—"}
                            </TableCell>
                            <TableCell>
                              {line.sourceMeta?.abcClass ?? "—"}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {line.suggestedQty}
                            </TableCell>
                            <TableCell>
                              {isDraft ? (
                                <Input
                                  type="number"
                                  min={0}
                                  className="w-24 tabular-nums"
                                  value={
                                    lineEdits[line.id]?.orderedQty ??
                                    line.orderedQty
                                  }
                                  onChange={(e) =>
                                    setLineEdits((prev) => ({
                                      ...prev,
                                      [line.id]: {
                                        ...prev[line.id],
                                        orderedQty: Number.parseInt(
                                          e.target.value,
                                          10,
                                        ) || 0,
                                        priority:
                                          prev[line.id]?.priority ??
                                          line.priority,
                                        notes:
                                          prev[line.id]?.notes ??
                                          line.notes ??
                                          "",
                                      },
                                    }))
                                  }
                                />
                              ) : (
                                <span className="tabular-nums">
                                  {line.orderedQty}
                                  {line.receivedQty > 0
                                    ? ` (${line.receivedQty} rcv)`
                                    : null}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isDraft ? (
                                <select
                                  className="rounded border px-2 py-1 text-sm"
                                  value={
                                    lineEdits[line.id]?.priority ?? line.priority
                                  }
                                  onChange={(e) =>
                                    setLineEdits((prev) => ({
                                      ...prev,
                                      [line.id]: {
                                        orderedQty:
                                          prev[line.id]?.orderedQty ??
                                          line.orderedQty,
                                        priority: e.target.value,
                                        notes:
                                          prev[line.id]?.notes ??
                                          line.notes ??
                                          "",
                                      },
                                    }))
                                  }
                                >
                                  <option value="NORMAL">Normal</option>
                                  <option value="HIGH">High</option>
                                </select>
                              ) : (
                                line.priority
                              )}
                            </TableCell>
                            {isDraft ? (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveLine(line.id)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {active.expiryWatch.length > 0 ? (
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-4">
                    <h3 className="text-sm font-semibold">
                      Expiry watch ({active.expiryWatch.length} batches)
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Dispense these first (FEFO) — not auto-added to the order
                      list.
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {active.expiryWatch.slice(0, 5).map((row) => (
                        <li key={row.batchId}>
                          {row.genericName} · batch {row.batchNumber ?? "—"} ·{" "}
                          {formatQuantityWithUnit(
                            row.quantityOnHand,
                            row.stockUnit,
                            row.unitsPerPack,
                          )}{" "}
                          · expires {row.expiryDate} ({row.daysUntilExpiry}d)
                        </li>
                      ))}
                      {active.expiryWatch.length > 5 ? (
                        <li className="text-muted-foreground">
                          +{active.expiryWatch.length - 5} more in printout
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}

                {isDraft ? (
                  <div className="rounded-lg border border-dashed p-4">
                    <h3 className="text-sm font-semibold">Add medicine</h3>
                    <div className="mt-3 space-y-3">
                      <MedicineCatalogSearch
                        variant="receive"
                        onSelect={setAddMedicine}
                      />
                      {addMedicine ? (
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="text-xs font-medium">Qty</label>
                            <Input
                              type="number"
                              min={1}
                              className="mt-1 w-28"
                              value={addQty}
                              onChange={(e) => setAddQty(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium">Unit</label>
                            <StockUnitSelect
                              value={addUnit}
                              onChange={setAddUnit}
                              className="mt-1"
                            />
                          </div>
                          <Button onClick={handleAddLine} disabled={loading}>
                            Add to order
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      {report ? (
        <div className="facility-report-print-root hidden print:block">
          <ProcurementOrderDocument data={report} />
        </div>
      ) : null}
    </>
  );
}
