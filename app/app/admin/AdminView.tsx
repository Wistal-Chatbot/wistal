import Link from "next/link";
import { OverviewPanel } from "./OverviewPanel";
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

      {active === "overview" ? <OverviewPanel /> : null}
      {active === "reports" ? <ReportsManager /> : null}
      {active === "quick" ? <QuickActionsManager /> : null}
    </div>
  );
}

