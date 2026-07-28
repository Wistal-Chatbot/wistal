"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AiReportPublicDto } from "@/lib/api/ai-reports-types";
import { ChevronLeft } from "../_components/icons";
import { LoadingIndicator } from "../_components/LoadingIndicator";
import styles from "./ReportRunner.module.css";
import { executeReport, getReport } from "./reportsApi";

type RunState = "idle" | "running" | "opening";

function ReportRunnerSkeleton() {
  return (
    <div
      className={`${styles.formCard} ${styles.formSkeleton}`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className={styles.srOnly}>Ładowanie formularza raportu…</span>
      <span className={styles.skeletonTitle} aria-hidden="true" />
      <span className={styles.skeletonText} aria-hidden="true" />
      <span className={styles.skeletonLabel} aria-hidden="true" />
      <span className={styles.skeletonInput} aria-hidden="true" />
      <span className={styles.skeletonButton} aria-hidden="true" />
    </div>
  );
}

export function ReportRunner({ reportId }: { reportId: string }) {
  const router = useRouter();
  const runInFlight = useRef(false);
  const [report, setReport] = useState<AiReportPublicDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [runState, setRunState] = useState<RunState>("idle");
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await getReport(reportId);
        if (cancelled) return;
        setReport(r);
        setValues(
          Object.fromEntries(Object.keys(r.inputParams).map((k) => [k, ""])),
        );
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Nie udało się wczytać raportu.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  async function run() {
    if (!report || runInFlight.current) return;
    for (const [key, def] of Object.entries(report.inputParams)) {
      if (def?.required && !(values[key] ?? "").trim()) {
        setRunError(`Uzupełnij wymagane pole: ${def.label ?? key}.`);
        return;
      }
    }
    runInFlight.current = true;
    setRunState("running");
    setRunError(null);
    try {
      const result = await executeReport(report.id, values);
      setRunState("opening");
      router.push(`/app/reports/runs/${result.executionId}`);
    } catch (e) {
      runInFlight.current = false;
      setRunState("idle");
      setRunError(e instanceof Error ? e.message : "Nie udało się wykonać raportu.");
    }
  }

  const paramEntries = report ? Object.entries(report.inputParams) : [];
  const running = runState !== "idle";

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} href="/app/reports">
        <ChevronLeft size={15} />
        Wszystkie raporty
      </Link>

      {loadError ? (
        <div className={styles.stateMsg}>{loadError}</div>
      ) : !report ? (
        <ReportRunnerSkeleton />
      ) : (
        <>
          <div className={styles.formCard} aria-busy={running}>
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
                    disabled={running}
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

            {running ? (
              <div className={styles.progressPanel}>
                <LoadingIndicator
                  label={
                    runState === "opening"
                      ? "Raport gotowy. Otwieram wynik…"
                      : "Generuję raport i analizuję dane…"
                  }
                />
              </div>
            ) : null}

            <button
              type="button"
              className={styles.runButton}
              onClick={() => void run()}
              disabled={running}
            >
              {runState === "opening"
                ? "Otwieranie wyniku…"
                : runState === "running"
                  ? "Generowanie…"
                  : "Uruchom raport"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
