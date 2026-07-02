"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { AiReportPublicDto, AiReportRunDto } from "@/lib/api/ai-reports-types";
import { ReportIcon } from "../_components/icons";
import styles from "./ReportsList.module.css";
import { listReports, listRuns, searchRuns } from "./reportsApi";

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

function inputValueToText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatInputParams(inputParams: unknown): string {
  if (!inputParams || typeof inputParams !== "object" || Array.isArray(inputParams)) {
    return "—";
  }

  const entries = Object.entries(inputParams)
    .map(([key, value]) => [key, inputValueToText(value)] as const)
    .filter(([, value]) => value.trim().length > 0);

  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${value}`).join(" · ");
}

export function ReportsList() {
  const [reports, setReports] = useState<AiReportPublicDto[]>([]);
  const [runs, setRuns] = useState<AiReportRunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runSearch, setRunSearch] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const r = await listReports();
        setReports(r);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nie udało się wczytać raportów.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void (async () => {
        setRunsLoading(true);
        try {
          const q = runSearch.trim();
          setRuns(q ? await searchRuns(q) : await listRuns());
          setRunsError(null);
        } catch (e) {
          setRunsError(
            e instanceof Error
              ? e.message
              : "Nie udało się wczytać uruchomień raportów.",
          );
        } finally {
          setRunsLoading(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(handle);
  }, [runSearch]);

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
        <div className={styles.recentHead}>
          <span>Ostatnie uruchomienia</span>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Szukaj po raporcie, NIP, użytkowniku…"
            value={runSearch}
            onChange={(e) => setRunSearch(e.target.value)}
          />
        </div>
        <table className={styles.recentTable}>
          <thead>
            <tr className={styles.headerRow}>
              <th>Raport</th>
              <th>Parametry</th>
              <th>Data</th>
              <th>Użytkownik</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runsLoading ? (
              <tr className={styles.recentRow}>
                <td className={styles.emptyCell} colSpan={5}>
                  Szukanie…
                </td>
              </tr>
            ) : runsError ? (
              <tr className={styles.recentRow}>
                <td className={styles.emptyCell} colSpan={5}>
                  {runsError}
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr className={styles.recentRow}>
                <td className={styles.emptyCell} colSpan={5}>
                  Brak uruchomień.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className={styles.recentRow}>
                  <td className={styles.runTitle}>
                    <Link
                      className={styles.runLink}
                      href={`/app/reports/runs/${run.id}`}
                    >
                      {run.reportName}
                    </Link>
                  </td>
                  <td className={styles.runParams}>{formatInputParams(run.inputParams)}</td>
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
