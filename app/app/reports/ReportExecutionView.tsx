"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { AiReportExecutionDetailDto } from "@/lib/api/ai-reports-types";
import { ChevronLeft, DownloadIcon } from "../_components/icons";
import { ReportPdfExport } from "./ReportPdfExport";
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

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "raport";
}

function pdfFilename(execution: AiReportExecutionDetailDto): string {
  return `raport-ai-${slugify(execution.reportName)}-${execution.id.slice(0, 8)}.pdf`;
}

function elementDebugInfo(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    childElementCount: element.childElementCount,
    className: element.className,
    left: Math.round(rect.left),
    textLength: element.innerText.length,
    top: Math.round(rect.top),
    height: Math.round(rect.height),
    width: Math.round(rect.width),
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  };
}

function createPdfCaptureHost(source: HTMLElement): HTMLDivElement {
  const host = document.createElement("div");
  host.dataset.pdfCaptureHost = "true";
  host.style.background = "#ffffff";
  host.style.left = "0";
  host.style.padding = "0";
  host.style.pointerEvents = "none";
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.width = "1040px";
  host.style.zIndex = "2147483647";

  const exportClone = source.cloneNode(true) as HTMLElement;
  exportClone.removeAttribute("aria-hidden");
  exportClone.style.background = "#ffffff";
  exportClone.style.left = "0";
  exportClone.style.pointerEvents = "auto";
  exportClone.style.position = "static";
  exportClone.style.top = "0";
  exportClone.style.width = "1040px";
  exportClone.style.zIndex = "auto";

  host.appendChild(exportClone);
  document.body.appendChild(host);
  return host;
}

function addCanvasToPdf(
  canvas: HTMLCanvasElement,
  jsPdfConstructor: typeof import("jspdf").jsPDF,
  filename: string,
) {
  const pdf = new jsPdfConstructor({
    format: "a4",
    orientation: "portrait",
    unit: "mm",
  });
  const marginMm = 8;
  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const imageWidthMm = pageWidthMm - marginMm * 2;
  const imageHeightMm = (canvas.height * imageWidthMm) / canvas.width;
  const pageContentHeightMm = pageHeightMm - marginMm * 2;
  const imageData = canvas.toDataURL("image/jpeg", 0.98);
  let renderedHeightMm = 0;

  pdf.addImage(
    imageData,
    "JPEG",
    marginMm,
    marginMm,
    imageWidthMm,
    imageHeightMm,
  );
  renderedHeightMm += pageContentHeightMm;

  while (renderedHeightMm < imageHeightMm) {
    pdf.addPage();
    pdf.addImage(
      imageData,
      "JPEG",
      marginMm,
      marginMm - renderedHeightMm,
      imageWidthMm,
      imageHeightMm,
    );
    renderedHeightMm += pageContentHeightMm;
  }

  pdf.save(filename);
}

export function ReportExecutionView({ executionId }: { executionId: string }) {
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const [execution, setExecution] = useState<AiReportExecutionDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

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

  async function downloadPdf() {
    if (!execution || !pdfRef.current || pdfLoading) return;

    setPdfLoading(true);
    setPdfError(null);

    let captureHost: HTMLDivElement | null = null;
    const source = pdfRef.current;
    console.groupCollapsed(
      `[AI Reports PDF] Eksport ${execution.reportName} (${execution.id})`,
    );

    try {
      console.log("[AI Reports PDF] source", elementDebugInfo(source));
      captureHost = createPdfCaptureHost(source);
      console.log("[AI Reports PDF] capture host", elementDebugInfo(captureHost));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const exportNode =
        captureHost.querySelector<HTMLElement>('[data-pdf-export-root="true"]') ??
        captureHost;
      const captureWidth = Math.ceil(exportNode.scrollWidth);
      const captureHeight = Math.ceil(exportNode.scrollHeight);

      if (captureWidth <= 0 || captureHeight <= 0) {
        throw new Error(
          `Invalid PDF capture size: ${captureWidth}x${captureHeight}`,
        );
      }

      console.log("[AI Reports PDF] render target", {
        ...elementDebugInfo(exportNode),
        captureHeight,
        captureWidth,
      });

      const canvas = await html2canvas(exportNode, {
        backgroundColor: "#ffffff",
        height: captureHeight,
        logging: true,
        scale: 2,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        width: captureWidth,
        windowHeight: captureHeight,
        windowWidth: 1100,
        onclone: (clonedDocument: Document) => {
          const captureClone = clonedDocument.querySelector<HTMLElement>(
            '[data-pdf-capture-host="true"]',
          );
          if (captureClone) {
            captureClone.style.background = "#ffffff";
            captureClone.style.left = "0";
            captureClone.style.position = "static";
            captureClone.style.top = "0";
            captureClone.style.width = "1040px";
          }

          const exportRoot = clonedDocument.querySelector<HTMLElement>(
            '[data-pdf-export-root="true"]',
          );
          console.log("[AI Reports PDF] cloned DOM", {
            captureHost: captureClone ? elementDebugInfo(captureClone) : null,
            exportRoot: exportRoot ? elementDebugInfo(exportRoot) : null,
          });
          if (!exportRoot) return;
          exportRoot.removeAttribute("aria-hidden");
          exportRoot.style.background = "#ffffff";
          exportRoot.style.left = "0";
          exportRoot.style.pointerEvents = "auto";
          exportRoot.style.position = "static";
          exportRoot.style.top = "0";
          exportRoot.style.width = "1040px";
          exportRoot.style.zIndex = "1";
        },
      });

      console.log("[AI Reports PDF] canvas", {
        height: canvas.height,
        width: canvas.width,
      });
      addCanvasToPdf(canvas, jsPDF, pdfFilename(execution));
      console.log("[AI Reports PDF] save completed");
    } catch (pdfGenerationError) {
      console.error("[AI Reports PDF] failed", pdfGenerationError);
      setPdfError("Nie udało się wygenerować PDF. Spróbuj ponownie.");
    } finally {
      captureHost?.remove();
      console.groupEnd();
      setPdfLoading(false);
    }
  }

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
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.pdfButton}
                onClick={() => void downloadPdf()}
                disabled={pdfLoading || execution.status !== "completed"}
              >
                <DownloadIcon size={15} />
                {pdfLoading ? "Generowanie PDF…" : "Pobierz jako PDF"}
              </button>
              <span className={`${styles.status} ${statusClass(execution.status)}`}>
                {statusLabel(execution.status)}
              </span>
            </div>
          </div>
          {pdfError ? <div className={styles.pdfError}>{pdfError}</div> : null}

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
          <ReportPdfExport
            ref={pdfRef}
            execution={execution}
            formattedDate={formatDate(execution.createdAt)}
            statusLabel={statusLabel(execution.status)}
          />
        </>
      )}
    </div>
  );
}
