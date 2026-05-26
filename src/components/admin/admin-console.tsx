"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createFacility,
  listFacilities,
  resetFacilityOwnerPassword,
  type FacilityListItem,
} from "@/lib/actions/admin";
import { logout } from "@/lib/actions/auth";
import { ResetPasswordDialog } from "@/components/auth/reset-password-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type ResetOwnerTarget = { tenantId: string; facilityName: string };

export function AdminConsole() {
  const router = useRouter();
  const [facilities, setFacilities] = useState<FacilityListItem[]>([]);
  const [loading, startLoad] = useTransition();
  const [pending, startMutate] = useTransition();
  const [resetTarget, setResetTarget] = useState<ResetOwnerTarget | null>(
    null,
  );

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");

  const load = () => {
    startLoad(async () => {
      const res = await listFacilities();
      if (res.success) setFacilities(res.data);
      else toast.error(res.error);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    startMutate(async () => {
      const res = await createFacility({
        name,
        slug,
        ownerEmail,
        ownerName: ownerName || undefined,
        ownerPassword,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Facility created");
      setName("");
      setSlug("");
      setOwnerEmail("");
      setOwnerName("");
      setOwnerPassword("");
      load();
    });
  };

  const handleLogout = () => {
    startMutate(async () => {
      await logout();
      router.push("/login");
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <ResetPasswordDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
        title="Reset owner password"
        description={
          resetTarget
            ? `Set a new password for the owner at ${resetTarget.facilityName}.`
            : ""
        }
        onSubmit={async (newPassword) => {
          if (!resetTarget) {
            return { success: false, error: "No facility selected" };
          }
          const res = await resetFacilityOwnerPassword({
            tenantId: resetTarget.tenantId,
            newPassword,
          });
          if (!res.success) {
            return { success: false, error: res.error };
          }
          return { success: true };
        }}
        onSuccess={() => toast.success("Owner password updated")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Manage facilities and reset <strong>owner</strong> passwords only.
        </p>
        <Button type="button" variant="outline" onClick={handleLogout}>
          Sign out
        </Button>
      </div>

      <section className="pharmacy-panel space-y-4">
        <h2 className="pharmacy-panel-title">Add facility</h2>
        <form
          onSubmit={handleCreate}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Input
            placeholder="Facility name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            placeholder="Slug (e.g. kakamega)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <Input
            type="email"
            placeholder="Owner email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
          />
          <Input
            placeholder="Owner name (optional)"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
          <PasswordInput
            placeholder="Owner initial password"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={pending}>
            Create facility
          </Button>
        </form>
      </section>

      <section className="pharmacy-panel">
        <h2 className="pharmacy-panel-title mb-4">
          Facilities &amp; usage (30 days)
        </h2>
        {loading && facilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Batches</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Units sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {facilities.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <span className="font-medium">{f.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {f.slug}
                      </span>
                    </TableCell>
                    <TableCell>
                      {f.ownerEmail ?? "—"}
                      {f.ownerName ? (
                        <span className="block text-xs text-muted-foreground">
                          {f.ownerName}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">{f.batchCount}</TableCell>
                    <TableCell className="text-right">{f.saleCount}</TableCell>
                    <TableCell className="text-right">{f.unitsSold30d}</TableCell>
                    <TableCell className="text-right">
                      {f.revenue30d.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {f.ownerEmail ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            setResetTarget({
                              tenantId: f.id,
                              facilityName: f.name,
                            })
                          }
                        >
                          Reset owner password
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
