import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  AppShellClient,
  type AppShellClientProps,
} from "@/components/layout/app-shell-client";

export type AppShellProps = Omit<AppShellClientProps, "session">;

export async function AppShell(props: AppShellProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return <AppShellClient session={session} {...props} />;
}
