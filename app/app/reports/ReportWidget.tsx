"use client";

import { useMemo } from "react";

import DOMPurify from "dompurify";
import Mustache from "mustache";

import styles from "./ReportWidget.module.css";

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
  const safeHtml = useMemo(() => {
    if (!htmlWidget || typeof window === "undefined") return null;
    let rendered: string;
    try {
      rendered = Mustache.render(htmlWidget, (outputData ?? {}) as Record<string, unknown>);
    } catch {
      rendered = htmlWidget;
    }
    return DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } });
  }, [htmlWidget, outputData]);

  if (htmlWidget && safeHtml !== null) {
    return (
      <div
        className={styles.widget}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return (
    <pre className={styles.fallback}>{JSON.stringify(outputData, null, 2)}</pre>
  );
}
