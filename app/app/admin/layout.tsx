import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Admin-only guard for every /app/admin/* route. Hiding the nav item in the
 * shell is cosmetic; this server-side check is what actually blocks a non-admin
 * who navigates to an admin URL directly.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isAdmin) {
    redirect("/app/chat");
  }

  return <>{children}</>;
}
