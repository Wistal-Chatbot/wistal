"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { AiReportPublicDto, AiReportRunDto } from "@/lib/api/ai-reports-types";
import { ReportIcon } from "../_components/icons";
import styles from "./ReportsList.module.css";
import { listReports, listRuns } from "./reportsApi";

function statusClass(status: string): string {
  if (status === "completed") return styles.statusDone;
  if (status === "failed" || status === "timeout") return styles.statusError;
  return styles.statusPending;
}

function statusLabel(status: string): string {
  if (status === "completed") return "Zakończone";
  if (status === "failed") return "Błąd";
  if (status === "timeout") return "Przekroczono czas";
  return "W toku";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportsList() {
  const [reports, setReports] = useState<AiReportPublicDto[]>([]);
  const [runs, setRuns] = useState<AiReportRunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [r, ru] = await Promise.all([listReports(), listRuns()]);
        setReports(r);
        setRuns(ru);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nie udało się wczytać raportów.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className={styles.page}>
      <p className={styles.intro}>
        Ustrukturyzowane raporty generowane przez AI. Wybierz raport, aby uruchomić go
        z parametrami i otrzymać wynik jako wyrenderowany widok.
      </p>

      {loading ? (
        <div className={styles.stateMsg}>Ładowanie…</div>
      ) : error ? (
        <div className={styles.stateMsg}>{error}</div>
      ) : reports.length === 0 ? (
        <div className={styles.stateMsg}>Brak aktywnych raportów.</div>
      ) : (
        <div className={styles.grid}>
          {reports.map((report) => (
            <div className={styles.reportCard} key={report.id}>
              <div className={styles.cardHead}>
                <span className={styles.cardIcon}>
                  <ReportIcon size={18} stroke="#1E2188" />
                </span>
                <div className={styles.cardName}>{report.name}</div>
              </div>
              <div className={styles.cardDesc}>{report.description}</div>
              <Link className={styles.runButton} href={`/app/reports/${report.id}/run`}>
                Uruchom raport
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className={styles.recentCard}>
        <div className={styles.recentHead}>Ostatnie uruchomienia</div>
        <table className={styles.recentTable}>
          <tbody>
            {runs.length === 0 ? (
              <tr className={styles.recentRow}>
                <td className={styles.runLink}>Brak uruchomień.</td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className={styles.recentRow}>
                  <td className={styles.runTitle}>
                    <Link
                      className={styles.runLink}
                      href={`/app/reports/${run.reportId}/run`}
                    >
                      {run.reportName}
                    </Link>
                  </td>
                  <td className={styles.runDate}>{formatDate(run.createdAt)}</td>
                  <td className={styles.runUser}>{run.userName ?? "—"}</td>
                  <td className={styles.runStatusCell}>
                    <span className={`${styles.status} ${statusClass(run.status)}`}>
                      {statusLabel(run.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
