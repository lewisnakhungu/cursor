import { AppShell } from "@/components/layout/app-shell";
import { AdminConsole } from "@/components/admin/admin-console";

export default function AdminPage() {
  return (
    <AppShell
      title="Platform administration"
      subtitle="Facilities, owners, and usage"
    >
      <AdminConsole />
    </AppShell>
  );
}
