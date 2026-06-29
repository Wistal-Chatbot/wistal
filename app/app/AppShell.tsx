"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./AppShell.module.css";

const primaryNav = [
  { href: "/app/chat", label: "Chatbot", section: "/app/chat" },
  { href: "/app/data", label: "Dane", section: "/app/data" },
  { href: "/app/reports", label: "Raporty AI", section: "/app/reports" },
  { href: "/app/admin", label: "Admin", section: "/app/admin" },
];

const titles: Array<{ match: string; title: string; crumb: string }> = [
  { match: "/app/admin/quick-actions", title: "Szybkie akcje", crumb: "Admin" },
  { match: "/app/admin/ai-reports", title: "Raporty AI", crumb: "Admin" },
  { match: "/app/admin", title: "Admin", crumb: "Konfiguracja systemu" },
  { match: "/app/reports", title: "Raporty AI", crumb: "Raporty generowane przez AI" },
  { match: "/app/data", title: "Dane", crumb: "Manualny browser ERP" },
  { match: "/app/chat", title: "Chatbot", crumb: "Asystent ERP" },
];

function titleForPath(pathname: string) {
  return (
    titles.find((item) => pathname.startsWith(item.match)) ?? {
      title: "Wistal ERP AI",
      crumb: "Panel wewnętrzny",
    }
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = titleForPath(pathname);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logoRow}>
          <Image src="/assets/wistal-logo.png" alt="Wistal" width={180} height={62} />
        </div>

        <p className={styles.navLabel}>NAWIGACJA</p>
        <nav className={styles.nav}>
          {primaryNav.map((item) => {
            const active = pathname.startsWith(item.section);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={active ? styles.navItemActive : styles.navItem}
                href={item.href}
                key={item.href}
              >
                <span className={styles.navGlyph} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.userPanel}>
          <div className={styles.initials}>JK</div>
          <div className={styles.userText}>
            <strong>Jan Kowalski</strong>
            <span>jan.kowalski@wistal.com.pl</span>
          </div>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div>
            <h1>{current.title}</h1>
            <p>{current.crumb}</p>
          </div>
          <div className={styles.usageBadge}>
            <span aria-hidden="true" />
            AI: 24% limitu
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
