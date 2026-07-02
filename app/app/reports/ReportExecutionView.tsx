"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { AiReportExecutionDetailDto } from "@/lib/api/ai-reports-types";
import { ChevronLeft } from "../_components/icons";
import { ReportWidget } from "./ReportWidget";
import styles from "./ReportExecutionView.module.css";
import { getRun } from "./reportsApi";

function statusLabel(status: string): string {
  if (status === "completed") return "Zakończone";
  if (status === "failed") return "Błąd";
  if (status === "timeout") return "Przekroczono czas";
  return "W toku";
}

function statusClass(status: string): string {
  if (status === "completed") return styles.statusDone;
  if (status === "failed" || status === "timeout") return styles.statusError;
  return styles.statusPending;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatJson(value: unknown): string {
  if (!value || typeof value !== "object") return "brak";
  return JSON.stringify(value, null, 2);
}

export function ReportExecutionView({ executionId }: { executionId: string }) {
  const [execution, setExecution] = useState<AiReportExecutionDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setExecution(null);
        setExecution(await getRun(executionId));
        setError(null);
      } catch (e) {
        setExecution(null);
        setError(
          e instanceof Error
            ? e.message
            : "Nie udało się wczytać uruchomienia raportu.",
        );
      }
    })();
  }, [executionId]);

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} href="/app/reports">
        <ChevronLeft size={15} />
        Wszystkie raporty
      </Link>

      {error ? (
        <div className={styles.stateMsg}>{error}</div>
      ) : !execution ? (
        <div className={styles.stateMsg}>Ładowanie…</div>
      ) : (
        <>
          <div className={styles.header}>
            <div>
              <div className={styles.kicker}>Wynik raportu AI</div>
              <h1 className={styles.title}>{execution.reportName}</h1>
            </div>
            <span className={`${styles.status} ${statusClass(execution.status)}`}>
              {statusLabel(execution.status)}
            </span>
          </div>

          <div className={styles.layout}>
            <main className={styles.result}>
              {execution.status === "completed" ? (
                <ReportWidget
                  htmlWidget={execution.htmlWidget}
                  outputData={execution.outputData}
                />
              ) : (
                <div className={styles.errorPanel}>
                  {execution.errorMessage ?? "Raport nie zwrócił wyniku."}
                </div>
              )}
            </main>

            <aside className={styles.metaPanel}>
              <div className={styles.metaTitle}>Szczegóły uruchomienia</div>
              <dl className={styles.metaList}>
                <div>
                  <dt>Data</dt>
                  <dd>{formatDate(execution.createdAt)}</dd>
                </div>
                <div>
                  <dt>Użytkownik</dt>
                  <dd>{execution.userName ?? "—"}</dd>
                </div>
                <div>
                  <dt>Czas generowania</dt>
                  <dd>
                    {execution.executionMs === null
                      ? "—"
                      : `${(execution.executionMs / 1000).toFixed(1)} s`}
                  </dd>
                </div>
                <div>
                  <dt>Tokeny</dt>
                  <dd>{execution.tokensUsed ?? "—"}</dd>
                </div>
                <div>
                  <dt>Zapytania SQL</dt>
                  <dd>{execution.sqlQueries.length}</dd>
                </div>
              </dl>

              <div className={styles.paramsTitle}>Parametry</div>
              <pre className={styles.jsonBlock}>{formatJson(execution.inputParams)}</pre>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
