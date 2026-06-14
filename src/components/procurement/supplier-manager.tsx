"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
  createSupplier,
  deleteSupplier,
  listSuppliers,
  updateSupplier,
} from "@/lib/actions/suppliers";
import type { SupplierView } from "@/lib/types";

export function SupplierManager({ onChanged }: { onChanged?: () => void }) {
  const [suppliers, setSuppliers] = useState<SupplierView[]>([]);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [loading, startLoad] = useTransition();

  const reload = useCallback(() => {
    startLoad(async () => {
      const response = await listSuppliers();
      if (response.success) setSuppliers(response.data);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    startLoad(async () => {
      const response = await createSupplier({
        name: name.trim(),
        contact: contact.trim() || null,
        notes: notes.trim() || null,
        isDefault,
      });
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Supplier added");
      setName("");
      setContact("");
      setNotes("");
      setIsDefault(false);
      reload();
      onChanged?.();
    });
  };

  const handleToggleDefault = (supplier: SupplierView) => {
    startLoad(async () => {
      const response = await updateSupplier({
        supplierId: supplier.id,
        name: supplier.name,
        contact: supplier.contact,
        notes: supplier.notes,
        isDefault: !supplier.isDefault,
      });
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      reload();
      onChanged?.();
    });
  };

  const handleDelete = (supplierId: string) => {
    startLoad(async () => {
      const response = await deleteSupplier(supplierId);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      toast.success("Supplier removed");
      reload();
      onChanged?.();
    });
  };

  return (
    <section className="pharmacy-panel space-y-4">
      <div>
        <h2 className="pharmacy-panel-title">Suppliers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wholesalers or KEMSA contacts — pick one when creating procurement
          orders.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Supplier name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="Phone / email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
        <Input
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Default
          </label>
          <Button onClick={handleCreate} disabled={loading}>
            Add
          </Button>
        </div>
      </div>

      {suppliers.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Default</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.contact ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant={s.isDefault ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleToggleDefault(s)}
                    >
                      {s.isDefault ? "Default" : "Set default"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(s.id)}
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
          No suppliers yet — add your wholesaler or KEMSA depot contact.
        </p>
      )}
    </section>
  );
}
