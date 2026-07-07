"use client";

import { useMemo } from "react";

import Mustache, { type TemplateSpans } from "mustache";

import { ReportWidget } from "../../reports/ReportWidget";
import styles from "./ReportWidgetPreview.module.css";

interface PreviewData {
  outputData: Record<string, unknown>;
  schemaError: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sampleTextForKey(key: string): string {
  return key;
}

function sampleValueForType(key: string, type: string): unknown {
  const normalized = type.toLowerCase();
  if (
    normalized.includes("array") ||
    normalized.includes("list") ||
    normalized.includes("lista") ||
    normalized.endsWith("[]")
  ) {
    return [sampleTextForKey(key)];
  }
  return sampleTextForKey(key);
}

function sampleValueFromSchema(key: string, descriptor: unknown): unknown {
  if (typeof descriptor === "string") return sampleValueForType(key, descriptor);
  if (Array.isArray(descriptor)) {
    return [sampleValueFromSchema(key, descriptor[0] ?? "string")];
  }
  if (!isObject(descriptor)) return sampleTextForKey(key);

  if (typeof descriptor.type === "string") {
    if (
      descriptor.type.toLowerCase().includes("array") &&
      "items" in descriptor
    ) {
      return [sampleValueFromSchema(key, descriptor.items)];
    }
    return sampleValueForType(key, descriptor.type);
  }

  if (isObject(descriptor.properties)) {
    return sampleObjectFromSchema(descriptor.properties);
  }

  return sampleObjectFromSchema(descriptor);
}

function sampleObjectFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).map(([key, descriptor]) => [
      key,
      sampleValueFromSchema(key, descriptor),
    ]),
  );
}

function getPath(target: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = target;
  for (const part of path) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown) {
  let current = target;
  path.slice(0, -1).forEach((part) => {
    if (!isObject(current[part])) current[part] = {};
    current = current[part] as Record<string, unknown>;
  });
  current[path[path.length - 1]] = value;
}

function setMissingPath(
  target: Record<string, unknown>,
  path: string[],
  value: unknown,
) {
  if (path.length === 0 || getPath(target, path) !== undefined) return;
  setPath(target, path, value);
}

function mergeObject(target: Record<string, unknown>, source: Record<string, unknown>) {
  Object.entries(source).forEach(([key, value]) => {
    if (isObject(value) && isObject(target[key])) {
      mergeObject(target[key], value);
    } else if (target[key] === undefined) {
      target[key] = value;
    }
  });
}

function pathFromTokenName(name: string): string[] {
  return name.split(".").filter(Boolean);
}

function sectionChildren(token: TemplateSpans[number]): TemplateSpans {
  const value = token[4];
  return Array.isArray(value) ? (value as TemplateSpans) : [];
}

function fillDataFromTemplate(
  target: Record<string, unknown>,
  tokens: TemplateSpans,
): boolean {
  let usesDotValue = false;

  tokens.forEach((token) => {
    const [type, name] = token;
    if (type === "name" || type === "&") {
      if (name === ".") {
        usesDotValue = true;
        return;
      }
      setMissingPath(target, pathFromTokenName(name), sampleTextForKey(name));
      return;
    }

    if (type !== "#") return;
    if (name === ".") {
      usesDotValue = true;
      return;
    }

    const childData: Record<string, unknown> = {};
    const childUsesDot = fillDataFromTemplate(childData, sectionChildren(token));
    const sectionValue =
      childUsesDot && Object.keys(childData).length === 0
        ? [sampleTextForKey(name)]
        : [childData];
    const path = pathFromTokenName(name);
    const existingValue = getPath(target, path);

    if (Array.isArray(existingValue) && isObject(existingValue[0])) {
      mergeObject(existingValue[0], childData);
    } else {
      setPath(target, path, sectionValue);
    }
  });

  return usesDotValue;
}

function buildPreviewData(
  htmlWidget: string,
  outputSchemaText: string,
): PreviewData {
  let outputData: Record<string, unknown> = {};
  let schemaError: string | null = null;

  try {
    const parsed = JSON.parse(outputSchemaText);
    if (isObject(parsed)) {
      outputData = sampleObjectFromSchema(parsed);
    } else {
      schemaError = "Schemat wyjścia nie jest obiektem JSON.";
    }
  } catch {
    schemaError = "Schemat wyjścia ma nieprawidłowy JSON.";
  }

  try {
    fillDataFromTemplate(outputData, Mustache.parse(htmlWidget));
  } catch {
    // The widget editor can temporarily contain invalid Mustache while typing.
  }

  return { outputData, schemaError };
}

export function ReportWidgetPreview({
  htmlWidget,
  outputSchemaText,
}: {
  htmlWidget: string;
  outputSchemaText: string;
}) {
  const previewData = useMemo(
    () => buildPreviewData(htmlWidget, outputSchemaText),
    [htmlWidget, outputSchemaText],
  );

  return (
    <section className={styles.preview}>
      <div className={styles.previewHeader}>
        <div className={styles.previewTitle}>Podgląd widgetu</div>
        {previewData.schemaError ? (
          <span className={styles.previewWarning}>{previewData.schemaError}</span>
        ) : (
          <span className={styles.previewBadge}>Dane przykładowe</span>
        )}
      </div>
      {htmlWidget.trim() ? (
        <div className={styles.previewBody}>
          <ReportWidget
            htmlWidget={htmlWidget}
            outputData={previewData.outputData}
          />
        </div>
      ) : (
        <div className={styles.previewEmpty}>Brak widgetu HTML.</div>
      )}
    </section>
  );
}
