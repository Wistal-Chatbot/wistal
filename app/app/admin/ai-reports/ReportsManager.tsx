"use client";

import { useEffect, useState } from "react";

import type {
  AdminAiReportDto,
  AiReportUpdatePayload,
} from "@/lib/api/ai-reports-types";
import styles from "../AdminView.module.css";
import {
  deleteAiReport,
  generateAiReport,
  listAiReports,
  updateAiReport,
} from "./adminApi";
import { ReportWidgetPreview } from "./ReportWidgetPreview";

interface EditForm {
  name: string;
  description: string;
  systemPrompt: string;
  outputSchemaText: string;
  inputParamsText: string;
  modelConfigText: string;
  htmlWidget: string;
  isActive: boolean;
}

/** Pretty-prints a jsonb value for editing; `{}` when empty. */
function prettyJson(value: unknown): string {
  if (value == null) return "{}";
  return JSON.stringify(value, null, 2);
}

function formFromReport(r: AdminAiReportDto): EditForm {
  return {
    name: r.name,
    description: r.description ?? "",
    systemPrompt: r.systemPrompt,
    outputSchemaText: prettyJson(r.outputSchema),
    inputParamsText: prettyJson(r.inputParams),
    modelConfigText: prettyJson(r.modelConfig),
    htmlWidget: r.htmlWidget ?? "",
    isActive: r.isActive,
  };
}

/** Parses a JSON-object field; throws a friendly error on invalid JSON / non-object. */
function parseJsonObject(text: string, field: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Pole „${field}" zawiera nieprawidłowy JSON.`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Pole „${field}" musi być obiektem JSON.`);
  }
  return parsed as Record<string, unknown>;
}

function buildUpdatePayload(form: EditForm): AiReportUpdatePayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    systemPrompt: form.systemPrompt.trim(),
    outputSchema: parseJsonObject(form.outputSchemaText, "Schemat wyjścia"),
    inputParams: parseJsonObject(form.inputParamsText, "Parametry wejścia"),
    modelConfig: parseJsonObject(form.modelConfigText, "Konfiguracja modelu"),
    htmlWidget: form.htmlWidget.trim() ? form.htmlWidget : null,
    isActive: form.isActive,
  };
}

/** Short "źródła danych" summary derived from the report's model_config. */
function sourcesSummary(modelConfig: unknown): string {
  if (!modelConfig || typeof modelConfig !== "object") return "—";
  const mc = modelConfig as Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(mc.tables)) {
    const tables = mc.tables.filter((t): t is string => typeof t === "string");
    if (tables.length > 0) parts.push(tables.join(", "));
  }
  if (mc.uses_company_lookup === true) parts.push("BizRaport");
  if (mc.web_search === true) parts.push("web");
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function ReportsManager() {
  const [items, setItems] = useState<AdminAiReportDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listAiReports());
      setListError(null);
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "Nie udało się wczytać raportów.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function patchForm(patch: Partial<EditForm>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function startEdit(report: AdminAiReportDto) {
    setForm(formFromReport(report));
    setEditingId(report.id);
    setFormError(null);
  }

  function resetForm() {
    setForm(null);
    setEditingId(null);
    setFormError(null);
  }

  async function generate() {
    const desc = description.trim();
    if (!desc) {
      setGenerateError("Opisz raport, który chcesz wygenerować.");
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const report = await generateAiReport(desc);
      setDescription("");
      await refresh();
      startEdit(report); // open the new draft for review
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Nie udało się wygenerować raportu.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function submit() {
    if (!form || editingId === null) return;
    if (!form.name.trim()) {
      setFormError("Podaj nazwę raportu.");
      return;
    }
    let payload: AiReportUpdatePayload;
    try {
      payload = buildUpdatePayload(form);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nieprawidłowe dane.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await updateAiReport(editingId, payload);
      resetForm();
      await refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się zapisać raportu.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(report: AdminAiReportDto) {
    setTogglingId(report.id);
    setListError(null);
    try {
      await updateAiReport(report.id, { isActive: !report.isActive });
      if (editingId === report.id) patchForm({ isActive: !report.isActive });
      await refresh();
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "Nie udało się zmienić statusu.",
      );
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(report: AdminAiReportDto) {
    if (!window.confirm(`Usunąć raport „${report.name}"?`)) return;
    try {
      await deleteAiReport(report.id);
      if (editingId === report.id) resetForm();
      await refresh();
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : "Nie udało się usunąć raportu.",
      );
    }
  }

  return (
    <>
      <p className={styles.sectionIntro}>
        Raporty AI to ustrukturyzowane analizy uruchamiane na osobnej zakładce.
        Opisz raport w języku naturalnym — model wygeneruje prompt, schemat
        wyjścia, widget HTML i konfigurację modelu (dane ERP, BizRaport,
        wyszukiwanie w internecie). Raport zapisuje się jako wersja robocza; przejrzyj
        go i aktywuj, aby stał się dostępny dla użytkowników.
      </p>

      {editingId !== null && form ? (
        <div className={styles.editorCard}>
          <div className={styles.formTitle}>Edytuj raport</div>
          <div className={styles.formHint}>
            Przejrzyj wygenerowaną konfigurację. Pola JSON muszą pozostać poprawnymi
            obiektami.
          </div>

          <div className={styles.labelRow}>Nazwa</div>
          <input
            className={styles.input}
            value={form.name}
            onChange={(e) => patchForm({ name: e.target.value })}
          />

          <div className={styles.labelRow}>Opis</div>
          <input
            className={styles.input}
            value={form.description}
            onChange={(e) => patchForm({ description: e.target.value })}
          />

          <div className={styles.labelRow}>System prompt</div>
          <textarea
            className={styles.textarea}
            value={form.systemPrompt}
            onChange={(e) => patchForm({ systemPrompt: e.target.value })}
          />

          <div className={styles.labelRow}>Schemat wyjścia (JSON)</div>
          <textarea
            className={`${styles.textarea} ${styles.jsonArea}`}
            value={form.outputSchemaText}
            onChange={(e) => patchForm({ outputSchemaText: e.target.value })}
          />

          <div className={styles.labelRow}>Parametry wejścia (JSON)</div>
          <textarea
            className={`${styles.textarea} ${styles.jsonArea}`}
            value={form.inputParamsText}
            onChange={(e) => patchForm({ inputParamsText: e.target.value })}
          />

          <div className={styles.labelRow}>Konfiguracja modelu (JSON)</div>
          <textarea
            className={`${styles.textarea} ${styles.jsonArea}`}
            value={form.modelConfigText}
            onChange={(e) => patchForm({ modelConfigText: e.target.value })}
          />

          <div className={styles.labelRow}>Widget HTML</div>
          <textarea
            className={`${styles.textarea} ${styles.jsonArea}`}
            value={form.htmlWidget}
            onChange={(e) => patchForm({ htmlWidget: e.target.value })}
          />
          <ReportWidgetPreview
            htmlWidget={form.htmlWidget}
            outputSchemaText={form.outputSchemaText}
          />

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => patchForm({ isActive: e.target.checked })}
            />
            Aktywny (widoczny dla użytkowników)
          </label>

          {formError ? <div className={styles.formError}>{formError}</div> : null}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.submitButton}
              onClick={() => void submit()}
              disabled={saving}
            >
              {saving ? "Zapisywanie…" : "Zapisz zmiany"}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={resetForm}
              disabled={saving}
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.manageGrid}>
        <div className={styles.tableCard}>
          <div className={styles.manageHead}>
            <div className={styles.tableCardTitle}>Skonfigurowane raporty AI</div>
            <span className={styles.manageCount}>{items.length} pozycji</span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>NAZWA</th>
                <th className={styles.th}>ŹRÓDŁA</th>
                <th className={styles.th}>STATUS</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className={styles.emptyCell} colSpan={4}>
                    Ładowanie…
                  </td>
                </tr>
              ) : listError ? (
                <tr>
                  <td className={styles.emptyCell} colSpan={4}>
                    {listError}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className={styles.emptyCell} colSpan={4}>
                    Brak raportów — wygeneruj pierwszy w formularzu obok.
                  </td>
                </tr>
              ) : (
                items.map((report) => (
                  <tr className={styles.tr} key={report.id}>
                    <td className={styles.td}>
                      <div className={styles.rowName}>{report.name}</div>
                      {report.description ? (
                        <div className={styles.rowDesc}>{report.description}</div>
                      ) : null}
                    </td>
                    <td className={styles.tdMonoSmall}>
                      {sourcesSummary(report.modelConfig)}
                    </td>
                    <td className={styles.td}>
                      <span
                        className={report.isActive ? styles.pillActive : styles.pillIdle}
                      >
                        {report.isActive ? "Aktywny" : "Nieaktywny"}
                      </span>
                    </td>
                    <td className={styles.tdActions}>
                      <button
                        type="button"
                        className={`${styles.rowAction} ${styles.actionEdit}`}
                        onClick={() => startEdit(report)}
                      >
                        Edytuj
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowAction} ${styles.actionToggle}`}
                        onClick={() => void toggleActive(report)}
                        disabled={togglingId === report.id}
                      >
                        {report.isActive ? "Dezaktywuj" : "Aktywuj"}
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowAction} ${styles.actionDelete}`}
                        onClick={() => void remove(report)}
                      >
                        Usuń
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.formCard}>
          <div className={styles.formTitle}>Nowy raport AI</div>
          <div className={styles.formHint}>
            Opisz raport w języku naturalnym. System wygeneruje prompt, schemat
            wyjścia, widget HTML i konfigurację modelu.
          </div>
          <div className={styles.labelRow}>Opis raportu</div>
          <textarea
            className={styles.textarea}
            placeholder="np. Oceń wiarygodność płatniczą kontrahenta na podstawie danych z BizRaport i historii faktur…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {generateError ? (
            <div className={styles.formError}>{generateError}</div>
          ) : null}
          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void generate()}
            disabled={generating}
          >
            {generating ? "Generowanie…" : "Wygeneruj raport"}
          </button>
        </div>
      </div>
    </>
  );
}
