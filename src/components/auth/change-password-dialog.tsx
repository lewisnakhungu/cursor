"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { changeOwnPassword } from "@/lib/actions/auth";
import { toast } from "sonner";

type ChangePasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }

    startTransition(async () => {
      const result = await changeOwnPassword({ currentPassword, newPassword });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      toast.success(
        "Password updated. Other devices have been signed out.",
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Pick a new password of at least 8 characters with a letter and a
              number. You stay signed in here; all other devices are signed
              out.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <label
                htmlFor="current-password"
                className="text-sm font-medium"
              >
                Current password
              </label>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="own-new-password" className="text-sm font-medium">
                New password
              </label>
              <PasswordInput
                id="own-new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="own-confirm-password"
                className="text-sm font-medium"
              >
                Confirm new password
              </label>
              <PasswordInput
                id="own-confirm-password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
