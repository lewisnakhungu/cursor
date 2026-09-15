"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createFacility,
  deleteFacility,
  listFacilities,
  resetFacilityOwnerPassword,
  suspendFacility,
  unsuspendFacility,
  updateFacilityFeatures,
  type FacilityListItem,
} from "@/lib/actions/admin";
import { logout } from "@/lib/actions/auth";
import { ResetPasswordDialog } from "@/components/auth/reset-password-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Lock,
  RotateCcw,
  Sliders,
  Trash2,
} from "lucide-react";

type ResetOwnerTarget = { tenantId: string; facilityName: string };
type SuspendTarget = { tenantId: string; facilityName: string };
type DeleteTarget = { tenantId: string; facilityName: string; hasData: boolean };

export function AdminConsole() {
  const router = useRouter();
  const [facilities, setFacilities] = useState<FacilityListItem[]>([]);
  const [loading, startLoad] = useTransition();
  const [pending, startMutate] = useTransition();

  // Dialog targets
  const [resetTarget, setResetTarget] = useState<ResetOwnerTarget | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<SuspendTarget | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [forceDelete, setForceDelete] = useState(false);

  // Features switch dialog
  const [featuresTarget, setFeaturesTarget] = useState<FacilityListItem | null>(null);
  const [featureOffline, setFeatureOffline] = useState(true);
  const [featureReports, setFeatureReports] = useState(true);
  const [featureProcurement, setFeatureProcurement] = useState(true);
  const [featureMaxStaff, setFeatureMaxStaff] = useState(3);

  // Add facility form
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
    const policyError = validatePasswordPolicy(ownerPassword);
    if (policyError) {
      toast.error(policyError);
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug.trim().toLowerCase())) {
      toast.error("Slug may only contain lowercase letters, numbers, and hyphens");
      return;
    }
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
      toast.success("Facility created & PostgreSQL schema provisioned");
      setName("");
      setSlug("");
      setOwnerEmail("");
      setOwnerName("");
      setOwnerPassword("");
      load();
    });
  };

  const handleSuspend = () => {
    if (!suspendTarget) return;
    startMutate(async () => {
      const res = await suspendFacility({
        tenantId: suspendTarget.tenantId,
        reason: suspendReason || undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Facility "${suspendTarget.facilityName}" has been suspended. All active staff sessions were invalidated.`);
      setSuspendTarget(null);
      setSuspendReason("");
      load();
    });
  };

  const handleUnsuspend = (tenantId: string, facilityName: string) => {
    startMutate(async () => {
      const res = await unsuspendFacility({ tenantId });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Facility "${facilityName}" reactivated successfully`);
      load();
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startMutate(async () => {
      const res = await deleteFacility({
        tenantId: deleteTarget.tenantId,
        force: forceDelete,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      if (res.data.action === "SOFT_DELETED") {
        toast.success(`Facility "${deleteTarget.facilityName}" archived & deactivated (audit history preserved).`);
      } else {
        toast.success(`Facility "${deleteTarget.facilityName}" and its isolated database schema purged.`);
      }
      setDeleteTarget(null);
      setForceDelete(false);
      load();
    });
  };

  const openFeaturesModal = (f: FacilityListItem) => {
    setFeaturesTarget(f);
    setFeatureOffline(f.offlineModeAllowed);
    setFeatureReports(f.reportsEnabled);
    setFeatureProcurement(f.procurementEnabled);
    setFeatureMaxStaff(f.maxStaffAccounts);
  };

  const handleSaveFeatures = () => {
    if (!featuresTarget) return;
    startMutate(async () => {
      const res = await updateFacilityFeatures({
        tenantId: featuresTarget.id,
        offlineModeAllowed: featureOffline,
        reportsEnabled: featureReports,
        procurementEnabled: featureProcurement,
        maxStaffAccounts: featureMaxStaff,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Feature switches updated for "${featuresTarget.name}"`);
      setFeaturesTarget(null);
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
      {/* 1. Reset Owner Password Dialog */}
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

      {/* 2. Suspend Facility Dialog */}
      <Dialog
        open={suspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSuspendTarget(null);
            setSuspendReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="size-5" />
              Suspend facility account
            </DialogTitle>
            <DialogDescription>
              Suspending <strong>{suspendTarget?.facilityName}</strong> will immediately
              lock all staff out, block POS checkouts, and reject API calls.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label htmlFor="suspend-reason" className="text-sm font-medium">
              Suspension reason (visible to staff)
            </label>
            <Input
              id="suspend-reason"
              placeholder="e.g. Account past due, Compliance audit review"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSuspendTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={handleSuspend}
            >
              Confirm suspension
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Delete Facility Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setForceDelete(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Delete facility account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.facilityName}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-muted-foreground">
            {deleteTarget?.hasData ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200">
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  Compliance Safeguard Notice
                </p>
                <p className="mt-1 text-xs">
                  This facility has recorded operational stock or sales. To comply with pharmaceutical regulatory record retention, it will be <strong>archived and deactivated</strong> rather than permanently erased.
                </p>
              </div>
            ) : (
              <p>
                This facility has no transaction history. Its record and isolated database schema will be cleanly purged.
              </p>
            )}

            {deleteTarget?.hasData && (
              <label className="flex items-center gap-2 pt-2 text-xs font-medium text-destructive cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceDelete}
                  onChange={(e) => setForceDelete(e.target.checked)}
                  className="rounded border-destructive text-destructive focus:ring-destructive"
                />
                Force permanent purge (drop schema &amp; all data permanently)
              </label>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={handleDelete}
            >
              {forceDelete ? "Permanently Purge" : "Confirm Deactivation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. SaaS Feature Switches Dialog */}
      <Dialog
        open={featuresTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFeaturesTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="size-5 text-primary" />
              SaaS Feature Switches &amp; Plan Limits
            </DialogTitle>
            <DialogDescription>
              Configure feature entitlement flags and user limits for <strong>{featuresTarget?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Offline Mode Switch */}
            <div className="flex items-start justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <label className="text-sm font-medium cursor-pointer" htmlFor="switch-offline">
                  Offline Capabilities
                </label>
                <p className="text-xs text-muted-foreground">
                  Allow facility staff to pre-cache inventory and dispense offline during network outages.
                </p>
              </div>
              <input
                id="switch-offline"
                type="checkbox"
                checked={featureOffline}
                onChange={(e) => setFeatureOffline(e.target.checked)}
                className="size-4 mt-1 rounded text-primary focus:ring-primary"
              />
            </div>

            {/* Reports & Analytics Switch */}
            <div className="flex items-start justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <label className="text-sm font-medium cursor-pointer" htmlFor="switch-reports">
                  Reports &amp; Stock Analytics
                </label>
                <p className="text-xs text-muted-foreground">
                  Access to 30-day PDF export reports, sales revenue breakdown, and ABC stocking insights.
                </p>
              </div>
              <input
                id="switch-reports"
                type="checkbox"
                checked={featureReports}
                onChange={(e) => setFeatureReports(e.target.checked)}
                className="size-4 mt-1 rounded text-primary focus:ring-primary"
              />
            </div>

            {/* Procurement Switch */}
            <div className="flex items-start justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <label className="text-sm font-medium cursor-pointer" htmlFor="switch-procurement">
                  Automated Procurement
                </label>
                <p className="text-xs text-muted-foreground">
                  Automated reorder point suggestions, supplier directory, and purchase order tracking.
                </p>
              </div>
              <input
                id="switch-procurement"
                type="checkbox"
                checked={featureProcurement}
                onChange={(e) => setFeatureProcurement(e.target.checked)}
                className="size-4 mt-1 rounded text-primary focus:ring-primary"
              />
            </div>

            {/* Max Staff Limit */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <label className="text-sm font-medium" htmlFor="input-max-staff">
                  Max Staff Accounts
                </label>
                <p className="text-xs text-muted-foreground">
                  Maximum allowed staff seats (deputy + dispensers; owner excluded).
                </p>
              </div>
              <Input
                id="input-max-staff"
                type="number"
                min={1}
                max={50}
                className="w-20 text-center font-semibold"
                value={featureMaxStaff}
                onChange={(e) => setFeatureMaxStaff(Number.parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFeaturesTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={handleSaveFeatures}
            >
              Save plan settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Platform Governance: Provision facilities, manage tenant lifecycle, toggle feature tiers, and reset credentials.
        </p>
        <Button type="button" variant="outline" onClick={handleLogout}>
          Sign out
        </Button>
      </div>

      {/* Add Facility Form */}
      <section className="pharmacy-panel space-y-4">
        <h2 className="pharmacy-panel-title">Add facility</h2>
        <form
          onSubmit={handleCreate}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="space-y-1">
            <label htmlFor="facility-name" className="text-sm font-medium">
              Facility name
            </label>
            <Input
              id="facility-name"
              placeholder="e.g. Afya Chemist Kakamega"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="facility-slug" className="text-sm font-medium">
              Slug
            </label>
            <Input
              id="facility-slug"
              placeholder="e.g. kakamega"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="owner-email" className="text-sm font-medium">
              Owner email
            </label>
            <Input
              id="owner-email"
              type="email"
              placeholder="owner@pharmacy.co.ke"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="owner-name" className="text-sm font-medium">
              Owner name <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="owner-name"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="owner-password" className="text-sm font-medium">
              Owner initial password
            </label>
            <PasswordInput
              id="owner-password"
              autoComplete="new-password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={pending} className="self-end">
            Create facility
          </Button>
        </form>
      </section>

      {/* Facilities Table */}
      <section className="pharmacy-panel">
        <div className="flex items-center justify-between mb-4">
          <h2 className="pharmacy-panel-title">
            Facilities &amp; Tenancy Management ({facilities.length})
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RotateCcw className="size-3.5 mr-1" />
            Refresh
          </Button>
        </div>

        {loading && facilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Feature Entitlements</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Batches</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Units sold (30d)</TableHead>
                  <TableHead className="text-right">Revenue (30d)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facilities.map((f) => (
                  <TableRow
                    key={f.id}
                    className={f.status === "SUSPENDED" ? "bg-amber-50/40 dark:bg-amber-950/20" : f.status === "DELETED" ? "opacity-60" : ""}
                  >
                    {/* Name & Slug */}
                    <TableCell>
                      <span className="font-medium">{f.name}</span>
                      <span className="block text-xs font-mono text-muted-foreground">
                        {f.slug}
                      </span>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      {f.status === "ACTIVE" ? (
                        <Badge variant="success" className="gap-1 font-normal">
                          <CheckCircle2 className="size-3" /> Active
                        </Badge>
                      ) : f.status === "SUSPENDED" ? (
                        <div className="space-y-0.5">
                          <Badge variant="warning" className="gap-1 font-normal">
                            <Ban className="size-3" /> Suspended
                          </Badge>
                          {f.suspendedReason && (
                            <span className="block text-[11px] text-amber-700 dark:text-amber-400 truncate max-w-[140px]" title={f.suspendedReason}>
                              {f.suspendedReason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Deactivated
                        </Badge>
                      )}
                    </TableCell>

                    {/* Features Tags */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {f.offlineModeAllowed ? (
                          <span className="rounded bg-emerald-100/70 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Offline
                          </span>
                        ) : (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500 dark:bg-zinc-800">
                            Online-only
                          </span>
                        )}
                        {f.reportsEnabled && (
                          <span className="rounded bg-blue-100/70 px-1.5 py-0.5 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Reports
                          </span>
                        )}
                        {f.procurementEnabled && (
                          <span className="rounded bg-indigo-100/70 px-1.5 py-0.5 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            Procurement
                          </span>
                        )}
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                          {f.maxStaffAccounts} staff max
                        </span>
                      </div>
                    </TableCell>

                    {/* Owner */}
                    <TableCell>
                      {f.ownerEmail ?? "—"}
                      {f.ownerName ? (
                        <span className="block text-xs text-muted-foreground">
                          {f.ownerName}
                        </span>
                      ) : null}
                    </TableCell>

                    {/* Metrics */}
                    <TableCell className="text-right">{f.batchCount}</TableCell>
                    <TableCell className="text-right">{f.saleCount}</TableCell>
                    <TableCell className="text-right">{f.unitsSold30d}</TableCell>
                    <TableCell className="text-right">
                      {f.revenue30d.toLocaleString()}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Features switch */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending || f.status === "DELETED"}
                          onClick={() => openFeaturesModal(f)}
                          title="Configure plan features & limits"
                        >
                          <Sliders className="size-3.5" />
                          <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">Features</span>
                        </Button>

                        {/* Suspend / Unsuspend */}
                        {f.status === "ACTIVE" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              setSuspendTarget({
                                tenantId: f.id,
                                facilityName: f.name,
                              })
                            }
                            className="text-amber-700 hover:text-amber-800 border-amber-300/60 hover:bg-amber-50"
                            title="Suspend facility"
                          >
                            <Ban className="size-3.5" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">Suspend</span>
                          </Button>
                        ) : f.status === "SUSPENDED" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => handleUnsuspend(f.id, f.name)}
                            className="text-emerald-700 hover:text-emerald-800 border-emerald-300/60 hover:bg-emerald-50"
                            title="Reactivate facility"
                          >
                            <CheckCircle2 className="size-3.5" />
                            <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">Activate</span>
                          </Button>
                        ) : null}

                        {/* Reset Owner Password */}
                        {f.ownerEmail && f.status !== "DELETED" ? (
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
                            title="Reset owner password"
                          >
                            <Lock className="size-3.5" />
                          </Button>
                        ) : null}

                        {/* Delete / Deactivate */}
                        {f.status !== "DELETED" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              setDeleteTarget({
                                tenantId: f.id,
                                facilityName: f.name,
                                hasData: f.batchCount > 0 || f.saleCount > 0,
                              })
                            }
                            className="text-muted-foreground hover:text-destructive"
                            title="Deactivate or delete facility"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
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
