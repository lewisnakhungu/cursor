"use client";

import { useEffect, useState, useTransition } from "react";
import {
  addTeamMember,
  listTeamMembers,
  removeTeamMember,
  resetTeamMemberPassword,
  updateTeamMemberRole,
  type TeamMemberView,
} from "@/lib/actions/team";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function TeamSettings() {
  const [members, setMembers] = useState<TeamMemberView[]>([]);
  const [slotsRemaining, setSlotsRemaining] = useState(3);
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"DEPUTY" | "DISPENSER">("DISPENSER");
  const [password, setPassword] = useState("");

  const load = () => {
    startTransition(async () => {
      const res = await listTeamMembers();
      if (res.success) {
        setMembers(res.data.members);
        setSlotsRemaining(res.data.slotsRemaining);
      } else {
        toast.error(res.error);
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addTeamMember({
        email,
        name: name || undefined,
        role,
        password,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("Team member added");
      setEmail("");
      setName("");
      setPassword("");
      load();
    });
  };

  const handleRoleChange = (membershipId: string, newRole: "DEPUTY" | "DISPENSER") => {
    startTransition(async () => {
      const res = await updateTeamMemberRole({ membershipId, role: newRole });
      if (!res.success) toast.error(res.error);
      else load();
    });
  };

  const handleRemove = (membershipId: string) => {
    if (!window.confirm("Remove this team member?")) return;
    startTransition(async () => {
      const res = await removeTeamMember(membershipId);
      if (!res.success) toast.error(res.error);
      else {
        toast.success("Removed");
        load();
      }
    });
  };

  const handleResetPassword = (membershipId: string, memberEmail: string) => {
    const newPassword = window.prompt(
      `New password for ${memberEmail} (min 8 chars):`,
    );
    if (!newPassword) return;
    startTransition(async () => {
      const res = await resetTeamMemberPassword({
        membershipId,
        newPassword,
      });
      if (!res.success) toast.error(res.error);
      else toast.success("Password updated");
    });
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        As facility owner you can add up to <strong>3</strong> staff: one deputy
        (receive + reports) and two dispensers (POS only).
      </p>

      {slotsRemaining > 0 && (
        <section className="pharmacy-panel space-y-4">
          <h2 className="pharmacy-panel-title">
            Add staff ({slotsRemaining} slot{slotsRemaining === 1 ? "" : "s"}{" "}
            left)
          </h2>
          <form
            onSubmit={handleAdd}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "DEPUTY" | "DISPENSER")
              }
            >
              <option value="DEPUTY">Deputy — receive &amp; reports</option>
              <option value="DISPENSER">Dispenser — POS only</option>
            </select>
            <Input
              type="password"
              placeholder="Initial password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={pending}>
              Add member
            </Button>
          </form>
        </section>
      )}

      <section className="pharmacy-panel">
        <h2 className="pharmacy-panel-title mb-4">Current team</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff accounts yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.membershipId}>
                  <TableCell>
                    {m.email}
                    {m.name ? (
                      <span className="block text-xs text-muted-foreground">
                        {m.name}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{m.role}</Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <select
                      className="rounded border border-input px-2 py-1 text-xs"
                      value={m.role}
                      disabled={pending}
                      onChange={(e) =>
                        handleRoleChange(
                          m.membershipId,
                          e.target.value as "DEPUTY" | "DISPENSER",
                        )
                      }
                    >
                      <option value="DEPUTY">DEPUTY</option>
                      <option value="DISPENSER">DISPENSER</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        handleResetPassword(m.membershipId, m.email)
                      }
                    >
                      Reset password
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => handleRemove(m.membershipId)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
