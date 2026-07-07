"use client";

import { forwardRef } from "react";

import type { AiReportExecutionDetailDto } from "@/lib/api/ai-reports-types";
import { ReportWidget } from "./ReportWidget";
import styles from "./ReportPdfExport.module.css";

function formatJson(value: unknown): string {
  if (!value || typeof value !== "object") return "brak";
  return JSON.stringify(value, null, 2);
}

export const ReportPdfExport = forwardRef<
  HTMLDivElement,
  {
    execution: AiReportExecutionDetailDto;
    formattedDate: string;
    statusLabel: string;
  }
>(function ReportPdfExport({ execution, formattedDate, statusLabel }, ref) {
  return (
    <div
      ref={ref}
      className={styles.exportRoot}
      data-pdf-export-root="true"
      aria-hidden="true"
    >
      <section className={styles.details}>
        <div className={styles.eyebrow}>Raport AI</div>
        <div className={styles.titleRow}>
          <div>
            <h1>{execution.reportName}</h1>
            <div className={styles.executionId}>ID: {execution.id}</div>
          </div>
          <span className={styles.status}>{statusLabel}</span>
        </div>

        <div className={styles.sectionTitle}>Szczegóły uruchomienia</div>
        <dl className={styles.metaGrid}>
          <div>
            <dt>Data</dt>
            <dd>{formattedDate}</dd>
          </div>
          <div>
            <dt>Użytkownik</dt>
            <dd>{execution.userName ?? "-"}</dd>
          </div>
          <div>
            <dt>Czas generowania</dt>
            <dd>
              {execution.executionMs === null
                ? "-"
                : `${(execution.executionMs / 1000).toFixed(1)} s`}
            </dd>
          </div>
          <div>
            <dt>Tokeny</dt>
            <dd>{execution.tokensUsed ?? "-"}</dd>
          </div>
          <div>
            <dt>Zapytania SQL</dt>
            <dd>{execution.sqlQueries.length}</dd>
          </div>
        </dl>

        <div className={styles.sectionTitle}>Parametry</div>
        <pre className={styles.params}>{formatJson(execution.inputParams)}</pre>
      </section>

      <section className={styles.widgetSection}>
        {execution.status === "completed" ? (
          <ReportWidget
            htmlWidget={execution.htmlWidget}
            outputData={execution.outputData}
          />
        ) : (
          <div className={styles.errorBox}>
            {execution.errorMessage ?? "Raport nie zwrócił wyniku."}
          </div>
        )}
      </section>
    </div>
  );
});
