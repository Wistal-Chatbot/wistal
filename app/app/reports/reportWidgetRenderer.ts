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

export interface RenderedReportWidget {
  css: string | null;
  html: string;
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
    html,
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
