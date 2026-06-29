import Link from "next/link";
import {
  adminStats,
  adminUsers,
  aiReports,
  quickActions,
  systemStatus,
  weeklyQueries,
} from "@/lib/mock-data";
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
      {active === "reports" ? <ReportsAdmin /> : null}
      {active === "quick" ? <QuickActionsAdmin /> : null}
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

function ReportsAdmin() {
  return (
    <div className={styles.manageGrid}>
      <div className={styles.tableCard}>
        <div className={styles.manageHead}>
          <div className={styles.tableCardTitle}>Skonfigurowane raporty AI</div>
          <span className={styles.manageCount}>{aiReports.length} pozycji</span>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>NAZWA</th>
              <th className={styles.th}>TABELE</th>
              <th className={styles.th}>STATUS</th>
              <th className={styles.th} />
            </tr>
          </thead>
          <tbody>
            {aiReports.map((report) => (
              <tr className={styles.tr} key={report.id}>
                <td className={styles.td}>
                  <div className={styles.rowName}>{report.name}</div>
                  <div className={styles.rowDesc}>{report.desc}</div>
                </td>
                <td className={styles.tdMonoSmall}>{report.tables}</td>
                <td className={styles.td}>
                  <span className={report.active ? styles.pillActive : styles.pillIdle}>
                    {report.active ? "Aktywny" : "Nieaktywny"}
                  </span>
                </td>
                <td className={styles.tdActions}>
                  <span className={styles.actionEdit}>Edytuj</span>
                  <span className={styles.actionDelete}>Usuń</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formTitle}>Nowy raport AI</div>
        <div className={styles.formHint}>
          Opisz raport w języku naturalnym. System wygeneruje prompt, schemat wyjścia,
          widget HTML i konfigurację modelu.
        </div>
        <label className={styles.formLabel}>Opis raportu</label>
        <textarea
          className={styles.textarea}
          placeholder="np. Oceń wiarygodność płatniczą kontrahenta na podstawie historii faktur i limitów…"
        />
        <div className={styles.checklist}>
          {["System prompt", "Schemat wyjścia (JSON)", "Widget HTML", "Konfiguracja modelu"].map(
            (item) => (
              <div className={styles.checkItem} key={item}>
                <span className={styles.checkBox}>✓</span>
                {item}
              </div>
            ),
          )}
        </div>
        <button type="button" className={styles.submitButton}>
          Wygeneruj raport
        </button>
      </div>
    </div>
  );
}

function QuickActionsAdmin() {
  return (
    <div className={styles.manageGrid}>
      <div className={styles.tableCard}>
        <div className={styles.manageHead}>
          <div className={styles.tableCardTitle}>Szybkie akcje</div>
          <span className={styles.manageCount}>{quickActions.length} pozycji</span>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>NAZWA</th>
              <th className={styles.th}>KLUCZ</th>
              <th className={styles.th}>POLE WEJŚCIA</th>
              <th className={styles.th}>STATUS</th>
              <th className={styles.th} />
            </tr>
          </thead>
          <tbody>
            {quickActions.map((action) => (
              <tr className={styles.tr} key={action.key}>
                <td className={styles.tdName}>{action.name}</td>
                <td className={styles.tdMonoSmall}>{action.key}</td>
                <td className={styles.tdSecondary}>{action.input ? action.input.label : "—"}</td>
                <td className={styles.td}>
                  <span className={action.enabled ? styles.pillActive : styles.pillIdle}>
                    {action.enabled ? "Włączona" : "Wyłączona"}
                  </span>
                </td>
                <td className={styles.tdActions}>
                  <span className={styles.actionEdit}>Edytuj</span>
                  <span className={styles.actionDelete}>Usuń</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.formCard}>
        <div className={styles.formTitle}>Nowa szybka akcja</div>
        <label className={styles.formLabel}>Nazwa</label>
        <input className={styles.input} placeholder="np. Zamówienia kontrahenta" />
        <label className={styles.formLabel}>Szablon promptu</label>
        <textarea
          className={styles.textarea}
          placeholder="np. Pokaż zamówienia kontrahenta {kontrahent} z ostatnich 90 dni"
        />
        <label className={styles.formLabel}>Pole wejścia (opcjonalne)</label>
        <input className={styles.input} placeholder="np. Kontrahent — lista lub tekst" />
        <button type="button" className={styles.submitButton}>
          Dodaj akcję
        </button>
      </div>
    </div>
  );
}
