"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AiReportPublicDto } from "@/lib/api/ai-reports-types";
import { ChevronLeft } from "../_components/icons";
import styles from "./ReportRunner.module.css";
import { executeReport, getReport } from "./reportsApi";

export function ReportRunner({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<AiReportPublicDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await getReport(reportId);
        setReport(r);
        setValues(
          Object.fromEntries(Object.keys(r.inputParams).map((k) => [k, ""])),
        );
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Nie udało się wczytać raportu.");
      }
    })();
  }, [reportId]);

  async function run() {
    if (!report) return;
    for (const [key, def] of Object.entries(report.inputParams)) {
      if (def?.required && !(values[key] ?? "").trim()) {
        setRunError(`Uzupełnij wymagane pole: ${def.label ?? key}.`);
        return;
      }
    }
    setRunning(true);
    setRunError(null);
    try {
      const result = await executeReport(report.id, values);
      router.push(`/app/reports/runs/${result.executionId}`);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Nie udało się wykonać raportu.");
    } finally {
      setRunning(false);
    }
  }

  const paramEntries = report ? Object.entries(report.inputParams) : [];

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} href="/app/reports">
        <ChevronLeft size={15} />
        Wszystkie raporty
      </Link>

      {loadError ? (
        <div className={styles.stateMsg}>{loadError}</div>
      ) : !report ? (
        <div className={styles.stateMsg}>Ładowanie…</div>
      ) : (
        <>
          <div className={styles.formCard}>
            <div className={styles.formTitle}>{report.name}</div>
            {report.description ? (
              <div className={styles.formHint}>{report.description}</div>
            ) : null}

            {paramEntries.length === 0 ? (
              <div className={styles.formHint}>Ten raport nie wymaga parametrów.</div>
            ) : (
              paramEntries.map(([key, def]) => (
                <div key={key} className={styles.field}>
                  <label className={styles.label}>
                    {def.label ?? key}
                    {def.required ? " *" : ""}
                  </label>
                  <input
                    className={styles.input}
                    type={def.type === "number" ? "number" : "text"}
                    placeholder={def.placeholder ?? ""}
                    value={values[key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                  {def.description ? (
                    <div className={styles.fieldHint}>{def.description}</div>
                  ) : null}
                </div>
              ))
            )}

            {runError ? <div className={styles.error}>{runError}</div> : null}

            <button
              type="button"
              className={styles.runButton}
              onClick={() => void run()}
              disabled={running}
            >
              {running ? "Generowanie…" : "Uruchom raport"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
