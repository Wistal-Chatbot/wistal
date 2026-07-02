"use client";

import { useMemo } from "react";

import styles from "./ReportWidget.module.css";
import { renderReportWidget } from "./reportWidgetRenderer";

/**
 * Renders a report result: interpolates output_data into the report's Mustache
 * html_widget, sanitizes the HTML (DOMPurify), and injects it. This component only
 * mounts client-side (after a run), so sanitizing always runs in the browser and
 * model HTML can never inject scripts/handlers. Falls back to a JSON view when
 * there is no widget.
 */
export function ReportWidget({
  htmlWidget,
  outputData,
}: {
  htmlWidget: string | null;
  outputData: unknown;
}) {
  const safeWidget = useMemo(() => {
    if (!htmlWidget || typeof window === "undefined") return null;
    return renderReportWidget(htmlWidget, outputData);
  }, [htmlWidget, outputData]);

  if (htmlWidget && safeWidget !== null) {
    return (
      <div className={styles.widget}>
        {safeWidget.css ? <style>{safeWidget.css}</style> : null}
        <div dangerouslySetInnerHTML={{ __html: safeWidget.html }} />
      </div>
    );
  }

  return (
    <pre className={styles.fallback}>{JSON.stringify(outputData, null, 2)}</pre>
  );
}
