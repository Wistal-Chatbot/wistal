import type { ReactNode } from "react";
import { AppShell } from "./AppShell";

export default function InternalAppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
