import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { AppUser } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/mock-data/types";
import { AppShell } from "./AppShell";

/**
 * Builds the sidebar view-model from the signed-in user. The DB has no `role`
 * column, so the displayed role is derived from `isAdmin`; initials fall back to
 * the email local part when the profile has no name yet.
 */
function toCurrentUser(user: AppUser): CurrentUser {
  const displayName = user.name?.trim() || user.email.split("@")[0];
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || displayName.slice(0, 2).toUpperCase();

  return {
    name: displayName,
    initials,
    email: user.email,
    role: user.isAdmin ? "Administrator" : "Pracownik",
    isAdmin: user.isAdmin,
  };
}

export default async function InternalAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Gate every /app/* route: without a valid session, send to login.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return <AppShell currentUser={toCurrentUser(user)}>{children}</AppShell>;
}
