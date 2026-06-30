"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { MonthlyAiUsageDto, MonthlyAiUsageResponse } from "@/lib/api/usage-types";
import { currentUser } from "@/lib/mock-data";
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

type UsageState =
  | { status: "loading"; usage: null }
  | { status: "ready"; usage: MonthlyAiUsageDto }
  | { status: "error"; usage: null };

const tokenFormatter = new Intl.NumberFormat("pl-PL");

function formatTokens(value: number | null): string {
  if (value === null) return "—";
  return tokenFormatter.format(value);
}

function usageBadgeLabel(state: UsageState): string {
  if (state.status === "loading") return "AI: sprawdzanie";
  if (state.status === "error") return "AI usage niedostępny";

  const { usage } = state;
  if (usage.status === "usage_unavailable") return "AI usage niedostępny";
  if (usage.status === "exceeded") return "AI limit przekroczony";
  return `AI: ${usage.percent}% limitu`;
}

function usageTone(state: UsageState): "normal" | "warning" | "exceeded" | "unavailable" {
  if (state.status !== "ready") return "unavailable";
  if (state.usage.status === "warning") return "warning";
  if (state.usage.status === "exceeded") return "exceeded";
  if (state.usage.status === "usage_unavailable") return "unavailable";
  return "normal";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = titleForPath(pathname);
  const [openMenu, setOpenMenu] = useState<"user" | "usage" | null>(null);
  const [usageState, setUsageState] = useState<UsageState>({
    status: "loading",
    usage: null,
  });

  const nav = primaryNav.filter((item) => !item.adminOnly || currentUser.isAdmin);
  const tone = usageTone(usageState);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsage() {
      try {
        const res = await fetch("/api/usage/ai", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Nie udało się pobrać zużycia AI.");
        const data = (await res.json()) as MonthlyAiUsageResponse;
        setUsageState({ status: "ready", usage: data.usage });
      } catch {
        if (controller.signal.aborted) return;
        setUsageState({ status: "error", usage: null });
      }
    }

    loadUsage();
    return () => controller.abort();
  }, []);

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
              className={`${styles.usageBadge} ${styles[`usageBadge_${tone}`]}`}
              onClick={() => setOpenMenu((m) => (m === "usage" ? null : "usage"))}
            >
              <span className={`${styles.usageDot} ${styles[`usageDot_${tone}`]}`} />
              {usageBadgeLabel(usageState)}
            </button>

            {openMenu === "usage" ? (
              <div className={styles.usagePopover}>
                {usageState.status === "ready" ? (
                  <>
                    <div className={styles.usageHead}>
                      <div className={styles.usageTitle}>Wykorzystanie AI</div>
                      <div className={styles.usagePeriod}>{usageState.usage.period}</div>
                    </div>
                    <div className={styles.usageSub}>
                      {usageState.usage.status === "usage_unavailable"
                        ? "Nie udało się pobrać aktualnego zużycia z Anthropic."
                        : "Limit miesięczny zespołu"}
                    </div>
                    <div className={styles.usageRow}>
                      <span>
                        {formatTokens(usageState.usage.usedTokens)} /{" "}
                        {formatTokens(usageState.usage.limitTokens)} tok.
                      </span>
                      <span className={styles.usagePercent}>
                        {usageState.usage.percent !== null
                          ? `${usageState.usage.percent}%`
                          : "—"}
                      </span>
                    </div>
                    <div className={styles.usageTrack}>
                      <div
                        className={`${styles.usageFill} ${styles[`usageFill_${tone}`]}`}
                        style={{ width: `${Math.min(usageState.usage.percent ?? 0, 100)}%` }}
                      />
                    </div>
                    <div className={styles.usageStats}>
                      <div className={styles.usageStat}>
                        <div className={styles.usageStatValue}>
                          {formatTokens(usageState.usage.remainingTokens)}
                        </div>
                        <div className={styles.usageStatLabel}>Pozostało tok.</div>
                      </div>
                      <div className={styles.usageStat}>
                        <div className={styles.usageStatValue}>
                          {usageState.usage.warningPercent}%
                        </div>
                        <div className={styles.usageStatLabel}>Próg ostrz.</div>
                      </div>
                    </div>
                    {usageState.usage.status === "usage_unavailable" ? (
                      <p className={styles.usageNote}>
                        System nie blokuje zapytań automatycznie, dopóki zużycie
                        jest niedostępne.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className={styles.usageHead}>
                      <div className={styles.usageTitle}>Wykorzystanie AI</div>
                      <div className={styles.usagePeriod}>—</div>
                    </div>
                    <div className={styles.usageSub}>
                      {usageState.status === "loading"
                        ? "Pobieram aktualne zużycie."
                        : "Nie udało się pobrać statusu zużycia AI."}
                    </div>
                    <p className={styles.usageNote}>
                      Limit nie blokuje zapytań, jeśli status zużycia jest
                      niedostępny.
                    </p>
                  </>
                )}
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
