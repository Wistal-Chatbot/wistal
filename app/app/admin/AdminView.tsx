import Link from "next/link";
import {
  adminStats,
  adminUsers,
  systemStatus,
  weeklyQueries,
} from "@/lib/mock-data";
import { QuickActionsManager } from "./quick-actions/QuickActionsManager";
import { ReportsManager } from "./ai-reports/ReportsManager";
import styles from "./AdminView.module.css";

export type AdminTab = "overview" | "reports" | "quick";

const tabs: Array<{ key: AdminTab; label: string; href: string }> = [
  { key: "overview", label: "Przegląd", href: "/app/admin" },
  { key: "reports", label: "Raporty AI", href: "/app/admin/ai-reports" },
  { key: "quick", label: "Szybkie akcje", href: "/app/admin/quick-actions" },
];

export function AdminView({ active }: { active: AdminTab }) {
  return (
    <div className={styles.page}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={tab.key === active ? styles.tabActive : styles.tab}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {active === "overview" ? <Overview /> : null}
      {active === "reports" ? <ReportsManager /> : null}
      {active === "quick" ? <QuickActionsManager /> : null}
    </div>
  );
}

function Overview() {
  return (
    <>
      <div className={styles.statGrid}>
        {adminStats.map((stat) => (
          <div className={styles.statCard} key={stat.label}>
            <div className={styles.statLabel}>{stat.label}</div>
            <div className={styles.statValue}>{stat.value}</div>
            <div
              className={
                stat.deltaTone === "good" ? styles.statDeltaGood : styles.statDeltaMuted
              }
            >
              {stat.delta}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.midGrid}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Zapytania AI — ostatnie 7 dni</div>
          <div className={styles.chart}>
            {weeklyQueries.map((bar) => (
              <div className={styles.chartCol} key={bar.day}>
                <div
                  className={bar.highlight ? styles.chartBarActive : styles.chartBar}
                  style={{ height: `${bar.pct}%` }}
                />
                <span className={bar.highlight ? styles.chartDayActive : styles.chartDay}>
                  {bar.day}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle}>Status systemu</div>
          <div className={styles.statusList}>
            {systemStatus.map((item) => (
              <div className={styles.statusRow} key={item.label}>
                <span
                  className={item.state === "online" ? styles.dotOnline : styles.dotWarn}
                />
                <span className={styles.statusName}>{item.label}</span>
                <span
                  className={item.state === "online" ? styles.statusValueOnline : styles.statusValueWarn}
                >
                  {item.valueLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableCardTitle}>Użytkownicy</div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>UŻYTKOWNIK</th>
              <th className={styles.th}>ROLA</th>
              <th className={styles.thRight}>ZAPYTANIA / MIES.</th>
              <th className={styles.th}>OSTATNIA AKTYWNOŚĆ</th>
              <th className={styles.th}>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {adminUsers.map((user) => (
              <tr className={styles.tr} key={user.name}>
                <td className={styles.tdName}>{user.name}</td>
                <td className={styles.tdSecondary}>{user.role}</td>
                <td className={styles.tdMonoRight}>{user.queries}</td>
                <td className={styles.tdMuted}>{user.lastActive}</td>
                <td className={styles.td}>
                  <span
                    className={user.status === "Aktywny" ? styles.pillActive : styles.pillIdle}
                  >
                    {user.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

