"use client";

import { useMemo } from "react";

import DOMPurify from "dompurify";
import Mustache from "mustache";

import styles from "./ReportWidget.module.css";

const FORBIDDEN_WIDGET_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "link",
  "meta",
  "base",
  "style",
];

const STYLE_TAG_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const CSS_DANGEROUS_RE =
  /@import|javascript\s*:|expression\s*\(|behavior\s*:|-moz-binding|<\/style/gi;

interface SafeWidget {
  css: string | null;
  html: string;
}

function sanitizeWidgetCss(css: string): string | null {
  const cleaned = css.replace(CSS_DANGEROUS_RE, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeWidget(rendered: string): SafeWidget {
  const cssBlocks: string[] = [];
  const htmlWithoutStyles = rendered.replace(STYLE_TAG_RE, (_match, css: string) => {
    cssBlocks.push(css);
    return "";
  });

  const html = DOMPurify.sanitize(htmlWithoutStyles, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["style", "class"],
    FORBID_TAGS: FORBIDDEN_WIDGET_TAGS,
    FORBID_ATTR: ["srcdoc"],
  });

  return {
    css: sanitizeWidgetCss(cssBlocks.join("\n")),
    html,
  };
}

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
    let rendered: string;
    try {
      rendered = Mustache.render(htmlWidget, (outputData ?? {}) as Record<string, unknown>);
    } catch {
      rendered = htmlWidget;
    }
    return sanitizeWidget(rendered);
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
