import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionPayload } from "@/lib/auth/session";
import { AppShell } from "./AppShell";

export default async function InternalAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Gate every /app/* route: without a valid JWT session, send to login.
  const session = await getSessionPayload();
  if (!session) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
