"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { aiUsage, currentUser } from "@/lib/mock-data";
import {
  AdminIcon,
  ChatIcon,
  ChevronUp,
  DataIcon,
  LogoutIcon,
  ReportIcon,
  ShieldIcon,
} from "./_components/icons";
import styles from "./AppShell.module.css";

type NavItem = {
  href: string;
  label: string;
  section: string;
  icon: typeof ChatIcon;
  adminOnly?: boolean;
};

const primaryNav: NavItem[] = [
  { href: "/app/chat", label: "Chatbot", section: "/app/chat", icon: ChatIcon },
  { href: "/app/data", label: "Dane", section: "/app/data", icon: DataIcon },
  { href: "/app/reports", label: "Raporty AI", section: "/app/reports", icon: ReportIcon },
  { href: "/app/admin", label: "Admin", section: "/app/admin", icon: AdminIcon, adminOnly: true },
];

const titles: Array<{ match: string; title: string; crumb: string }> = [
  { match: "/app/admin", title: "Admin", crumb: "Konfiguracja systemu" },
  { match: "/app/reports/", title: "Wynik raportu", crumb: "Raporty AI" },
  { match: "/app/reports", title: "Raporty AI", crumb: "Raporty generowane przez AI" },
  { match: "/app/data", title: "Dane", crumb: "Magazyn / Katalog" },
  { match: "/app/chat", title: "Chatbot", crumb: "Asystent AI" },
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
  const router = useRouter();
  const current = titleForPath(pathname);
  const [openMenu, setOpenMenu] = useState<"user" | "usage" | null>(null);

  const nav = primaryNav.filter((item) => !item.adminOnly || currentUser.isAdmin);

  async function logout() {
    setOpenMenu(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the call fails, send the user back to login.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logoRow}>
          <Image src="/assets/wistal-logo.png" alt="Wistal" width={122} height={24} priority unoptimized />
        </div>

        <p className={styles.navLabel}>NAWIGACJA</p>
        <nav className={styles.nav}>
          {nav.map((item) => {
            const active = pathname.startsWith(item.section);
            const Icon = item.icon;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={active ? styles.navItemActive : styles.navItem}
                href={item.href}
                key={item.href}
              >
                <span className={styles.navGlyph}>
                  <Icon />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.userArea}>
          <button
            type="button"
            className={styles.userPanel}
            onClick={() => setOpenMenu((m) => (m === "user" ? null : "user"))}
          >
            <span className={styles.initials}>{currentUser.initials}</span>
            <span className={styles.userText}>
              <strong>{currentUser.name}</strong>
              <span>{currentUser.role}</span>
            </span>
            <span className={styles.userChevron}>
              <ChevronUp size={14} />
            </span>
          </button>

          {openMenu === "user" ? (
            <div className={styles.userPopover}>
              <div className={styles.userPopoverHead}>
                <div className={styles.userPopoverName}>{currentUser.name}</div>
                <div className={styles.userPopoverEmail}>{currentUser.email}</div>
                {currentUser.isAdmin ? (
                  <span className={styles.adminBadge}>
                    <ShieldIcon size={12} />
                    Administrator
                  </span>
                ) : null}
              </div>
              <div className={styles.popoverDivider} />
              <button type="button" className={styles.logoutButton} onClick={logout}>
                <LogoutIcon size={16} />
                Wyloguj się
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <h1 className={styles.viewTitle}>{current.title}</h1>
          <p className={styles.viewCrumb}>{current.crumb}</p>
          <div className={styles.spacer} />

          <div className={styles.usageWrap}>
            <button
              type="button"
              className={styles.usageBadge}
              onClick={() => setOpenMenu((m) => (m === "usage" ? null : "usage"))}
            >
              <span className={styles.usageDot} />
              AI {aiUsage.percent}%
            </button>

            {openMenu === "usage" ? (
              <div className={styles.usagePopover}>
                <div className={styles.usageHead}>
                  <div className={styles.usageTitle}>Wykorzystanie AI</div>
                  <div className={styles.usagePeriod}>{aiUsage.period}</div>
                </div>
                <div className={styles.usageSub}>Limit miesięczny zespołu</div>
                <div className={styles.usageRow}>
                  <span>
                    {aiUsage.usedTokens} / {aiUsage.totalTokens} tok.
                  </span>
                  <span className={styles.usagePercent}>{aiUsage.percent}%</span>
                </div>
                <div className={styles.usageTrack}>
                  <div className={styles.usageFill} style={{ width: `${aiUsage.percent}%` }} />
                </div>
                <div className={styles.usageStats}>
                  <div className={styles.usageStat}>
                    <div className={styles.usageStatValue}>{aiUsage.queriesToday}</div>
                    <div className={styles.usageStatLabel}>Zapytań dziś</div>
                  </div>
                  <div className={styles.usageStat}>
                    <div className={styles.usageStatValue}>{aiUsage.monthlyCost}</div>
                    <div className={styles.usageStatLabel}>Koszt mies.</div>
                  </div>
                </div>
                <div className={styles.usageListLabel}>NAJAKTYWNIEJSI</div>
                <div className={styles.usageList}>
                  {aiUsage.topUsers.map((u) => (
                    <div className={styles.usageListItem} key={u.name}>
                      <span>{u.name}</span>
                      <span className={styles.usageListTokens}>{u.tokens}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>

      {openMenu ? (
        <button
          type="button"
          aria-label="Zamknij menu"
          className={styles.backdrop}
          onClick={() => setOpenMenu(null)}
        />
      ) : null}
    </div>
  );
}
