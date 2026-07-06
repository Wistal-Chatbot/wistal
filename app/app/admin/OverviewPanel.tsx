"use client";

import { useEffect, useState } from "react";
import type { AdminOverviewResponse } from "@/lib/api/admin-overview-types";
import { fetchAdminOverview } from "./overviewApi";
import styles from "./AdminView.module.css";

/**
 * Admin „Przegląd" (Overview) tab — KPI tiles, 7-day query chart, system status,
 * and the users table. Fetches live data from `GET /api/admin/overview` on mount.
 */
export function OverviewPanel() {
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAdminOverview()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Nie udało się wczytać przeglądu.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className={styles.overviewState}>Ładowanie przeglądu…</div>;
  }
  if (error) {
    return <div className={styles.overviewError}>{error}</div>;
  }
  if (!data) return null;

  const { stats, weeklyQueries, systemStatus, users } = data;

  return (
    <>
      <div className={styles.statGrid}>
        {stats.map((stat) => (
          <div className={styles.statCard} key={stat.label}>
            <div className={styles.statLabel}>{stat.label}</div>
            <div className={styles.statValue}>{stat.value}</div>
            <div
              className={
                stat.deltaTone === "good"
                  ? styles.statDeltaGood
                  : styles.statDeltaMuted
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
            {weeklyQueries.map((bar, i) => (
              <div className={styles.chartCol} key={`${bar.day}-${i}`}>
                <span className={styles.chartTooltip}>
                  {bar.count.toLocaleString("pl-PL")}
                </span>
                <div
                  className={bar.highlight ? styles.chartBarActive : styles.chartBar}
                  style={{ height: `${bar.pct}%` }}
                />
                <span
                  className={bar.highlight ? styles.chartDayActive : styles.chartDay}
                >
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
                  className={
                    item.state === "online"
                      ? styles.statusValueOnline
                      : styles.statusValueWarn
                  }
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
            {users.length === 0 ? (
              <tr className={styles.tr}>
                <td className={styles.emptyCell} colSpan={5}>
                  Brak aktywnych użytkowników.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr className={styles.tr} key={user.name}>
                  <td className={styles.tdName}>{user.name}</td>
                  <td className={styles.tdSecondary}>{user.role}</td>
                  <td className={styles.tdMonoRight}>{user.queries}</td>
                  <td className={styles.tdMuted}>{user.lastActive}</td>
                  <td className={styles.td}>
                    <span
                      className={
                        user.status === "Aktywny" ? styles.pillActive : styles.pillIdle
                      }
                    >
                      {user.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
