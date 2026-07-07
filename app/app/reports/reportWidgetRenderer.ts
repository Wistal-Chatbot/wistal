import DOMPurify from "dompurify";
import Mustache from "mustache";

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

const NBSP = " ";

export interface RenderedReportWidget {
  css: string | null;
  html: string;
}

function normalizeNumberText(value: string | null): string {
  return String(value ?? "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFirstNumber(
  text: string,
): { match: string; value: number; decimals: number } | null {
  const match = normalizeNumberText(text).match(/-?\d[\d\s]*(?:[,.]\d+)?/);
  if (!match) return null;
  const raw = match[0].replace(/\s/g, "").replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return { match: match[0], value, decimals: (raw.split(".")[1] || "").length };
}

function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(value)
    .replace(/\s/g, NBSP);
}

function tidyUnits(text: string): string {
  return text
    .replace(/\s*zł\b/g, NBSP + "zł")
    .replace(/\s*%/g, "%")
    .replace(/\s*dni\b/g, NBSP + "dni")
    .replace(/\s*lat\b/g, NBSP + "lat");
}

/** Formats the number inside a single `[data-num]` element, in place. */
function formatNumericElement(el: HTMLElement): void {
  const type = el.dataset.num;
  const text = normalizeNumberText(el.textContent);
  if (!text || text.includes("{{")) return;

  const parsed = parseFirstNumber(text);
  if (!parsed) return;

  let decimals = 0;
  if (type === "decimal") decimals = Math.min(Math.max(parsed.decimals, 1), 2);
  if (type === "percent") decimals = Math.min(parsed.decimals, 2);
  if (type === "money") decimals = parsed.decimals > 0 ? Math.min(parsed.decimals, 2) : 0;

  const formatted = formatNumber(parsed.value, decimals);
  el.textContent = tidyUnits(text.replace(parsed.match, formatted));
}

/** Formats long inline numbers inside free-text nodes (recommendation, timeline…). */
function formatLongNumbersInText(text: string | null): string {
  if (!text || text.includes("{{")) return text ?? "";
  return tidyUnits(
    text.replace(
      /(^|[^\d.,])(-?\d[\d\s ]{4,}(?:[,.]\d+)?)(?![\d.,])/g,
      (full, prefix: string, num: string) => {
        const compact = num.replace(/[\s ]/g, "").replace(",", ".");
        const value = Number(compact);
        if (!Number.isFinite(value)) return full;
        const onlyDigits = compact.replace(/[-.]/g, "");
        if (onlyDigits.length < 5) return full; // leave years (2025) and short ids alone
        const decimals = compact.includes(".")
          ? Math.min(compact.split(".")[1].length, 2)
          : 0;
        return prefix + formatNumber(value, decimals);
      },
    ),
  ).replace(/(-?\d+)\.(\d+)%/g, "$1,$2%");
}

/**
 * Applies pl-PL number formatting to already-sanitized widget HTML, driven by the
 * `data-num` / `data-format-text` attributes the report template puts on elements.
 * Runs in the trusted renderer (not model JS, which the sanitizer strips) and only
 * when a DOM parser is available (client-side).
 */
function formatWidgetNumbers(html: string): string {
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll<HTMLElement>("[data-num]").forEach(formatNumericElement);

  doc
    .querySelectorAll<HTMLElement>(".recommendation, .timeline-text, [data-format-text]")
    .forEach((el) => {
      el.childNodes.forEach((node) => {
        if (node.nodeType === 3) {
          node.nodeValue = formatLongNumbersInText(node.nodeValue);
        }
      });
    });

  return doc.body.innerHTML;
}

function sanitizeWidgetCss(css: string): string | null {
  const cleaned = css.replace(CSS_DANGEROUS_RE, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeWidget(rendered: string): RenderedReportWidget {
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
    html: formatWidgetNumbers(html),
  };
}

export function renderReportWidget(
  htmlWidget: string,
  outputData: unknown,
): RenderedReportWidget {
  let rendered: string;

  try {
    rendered = Mustache.render(htmlWidget, (outputData ?? {}) as Record<string, unknown>);
  } catch {
    rendered = htmlWidget;
  }

  return sanitizeWidget(rendered);
}
