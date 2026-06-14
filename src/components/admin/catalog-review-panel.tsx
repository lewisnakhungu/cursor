"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveCatalogProposal,
  getCatalogAdminStats,
  listCatalogAliasProposals,
  listRecentLearnedAliases,
  rejectCatalogProposal,
  revokeLearnedAlias,
  type CatalogAdminStats,
  type CatalogAliasProposalView,
  type LearnedAliasView,
} from "@/lib/actions/catalog-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CatalogReviewPanel() {
  const [stats, setStats] = useState<CatalogAdminStats | null>(null);
  const [proposals, setProposals] = useState<CatalogAliasProposalView[]>([]);
  const [learned, setLearned] = useState<LearnedAliasView[]>([]);
  const [loading, startLoad] = useTransition();
  const [pending, startMutate] = useTransition();

  const load = () => {
    startLoad(async () => {
      const [statsRes, proposalsRes, learnedRes] = await Promise.all([
        getCatalogAdminStats(),
        listCatalogAliasProposals(),
        listRecentLearnedAliases(),
      ]);
      if (statsRes.success) setStats(statsRes.data);
      if (proposalsRes.success) setProposals(proposalsRes.data);
      if (learnedRes.success) setLearned(learnedRes.data);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = (id: string) => {
    startMutate(async () => {
      const res = await approveCatalogProposal(id);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Alias approved");
      load();
    });
  };

  const handleReject = (id: string) => {
    startMutate(async () => {
      const res = await rejectCatalogProposal(id);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Proposal rejected");
      load();
    });
  };

  const handleRevoke = (id: string) => {
    startMutate(async () => {
      const res = await revokeLearnedAlias(id);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Alias revoked");
      load();
    });
  };

  return (
    <div className="space-y-8">
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Searchable items" value={stats.searchableMedicines} />
          <StatCard label="Non-pharm items" value={stats.nonPharmItems} />
          <StatCard label="Active aliases" value={stats.activeAliases} />
          <StatCard label="Pending review" value={stats.pendingProposals} />
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Pending alias proposals</h2>
          <p className="text-sm text-muted-foreground">
            Conflicting supplier names submitted by facilities during bulk
            receive — approve to add to the global catalog.
          </p>
        </div>
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier name</TableHead>
                <TableHead>Proposed match</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No pending proposals
                  </TableCell>
                </TableRow>
              )}
              {proposals.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.rawName}</TableCell>
                  <TableCell>
                    {row.genericName}
                    {[row.dosageForm, row.strength].filter(Boolean).length > 0
                      ? ` · ${[row.dosageForm, row.strength].filter(Boolean).join(" · ")}`
                      : null}
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">
                    {row.note}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      disabled={pending || loading}
                      onClick={() => handleApprove(row.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || loading}
                      onClick={() => handleReject(row.id)}
                    >
                      Reject
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Recently learned aliases</h2>
          <p className="text-sm text-muted-foreground">
            Supplier labels auto-learned from bulk imports. Revoke incorrect
            mappings so they stop matching.
          </p>
        </div>
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier / brand label</TableHead>
                <TableHead>Catalog item</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {learned.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No learned aliases yet
                  </TableCell>
                </TableRow>
              )}
              {learned.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    {row.genericName}
                    {[row.dosageForm, row.strength].filter(Boolean).length > 0
                      ? ` · ${[row.dosageForm, row.strength].filter(Boolean).join(" · ")}`
                      : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {row.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || loading}
                      onClick={() => handleRevoke(row.id)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
