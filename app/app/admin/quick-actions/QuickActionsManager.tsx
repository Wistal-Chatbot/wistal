"use client";

import { useEffect, useState } from "react";

import type {
  AdminQuickActionDto,
  CustomInput,
  QuickActionPayload,
} from "@/lib/api/quick-actions-types";
import styles from "../AdminView.module.css";
import {
  createQuickAction,
  deleteQuickAction,
  listQuickActions,
  updateQuickAction,
} from "./adminApi";

type InputType = "none" | "text" | "select_from_db";

interface FormState {
  namePl: string;
  key: string;
  keyTouched: boolean;
  promptTemplate: string;
  inputType: InputType;
  label: string;
  placeholder: string;
  query: string;
  valueColumn: string;
  labelColumn: string;
  required: boolean;
  usesDatabase: boolean;
  usesWebSearch: boolean;
  isEnabled: boolean;
  displayOrder: string;
}

const EMPTY_FORM: FormState = {
  namePl: "",
  key: "",
  keyTouched: false,
  promptTemplate: "",
  inputType: "none",
  label: "",
  placeholder: "",
  query: "",
  valueColumn: "",
  labelColumn: "",
  required: false,
  usesDatabase: false,
  usesWebSearch: false,
  isEnabled: true,
  displayOrder: "0",
};

/** Derives a URL-safe key from the action name. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

/** Populates the form from an existing action for editing. */
function formFromAction(action: AdminQuickActionDto): FormState {
  const ci = action.customInput;
  const hasInput = "type" in ci;
  return {
    namePl: action.namePl,
    key: action.key,
    keyTouched: true,
    promptTemplate: action.promptTemplate,
    inputType: hasInput ? ci.type : "none",
    label: hasInput ? ci.label : "",
    placeholder: hasInput && ci.type === "text" ? (ci.placeholder ?? "") : "",
    query: hasInput && ci.type === "select_from_db" ? ci.query : "",
    valueColumn: hasInput && ci.type === "select_from_db" ? ci.valueColumn : "",
    labelColumn:
      hasInput && ci.type === "select_from_db" ? (ci.labelColumn ?? "") : "",
    required: hasInput ? (ci.required ?? false) : false,
    usesDatabase: action.usesDatabase,
    usesWebSearch: action.usesWebSearch,
    isEnabled: action.isEnabled,
    displayOrder: String(action.displayOrder),
  };
}

/** Builds the `custom_input` blob from the form. */
function buildCustomInput(form: FormState): CustomInput {
  if (form.inputType === "text") {
    return {
      type: "text",
      label: form.label.trim(),
      ...(form.placeholder.trim() ? { placeholder: form.placeholder.trim() } : {}),
      required: form.required,
    };
  }
  if (form.inputType === "select_from_db") {
    return {
      type: "select_from_db",
      label: form.label.trim(),
      query: form.query.trim(),
      valueColumn: form.valueColumn.trim(),
      ...(form.labelColumn.trim() ? { labelColumn: form.labelColumn.trim() } : {}),
      required: form.required,
    };
  }
  return {};
}

/** Returns a validation error message, or null when the form is valid. */
function validate(form: FormState): string | null {
  if (!form.namePl.trim()) return "Podaj nazwę akcji.";
  if (!form.key.trim()) return "Podaj klucz akcji.";
  if (!/^[a-z0-9_]+$/.test(form.key.trim())) {
    return "Klucz może zawierać tylko małe litery, cyfry i podkreślenia.";
  }
  if (!form.promptTemplate.trim()) return "Podaj szablon promptu.";
  if (form.inputType !== "none" && !form.label.trim()) {
    return "Podaj etykietę pola wejścia.";
  }
  if (form.inputType === "select_from_db") {
    if (!form.query.trim()) return "Podaj zapytanie SQL dla listy.";
    if (!form.valueColumn.trim()) return "Podaj kolumnę wartości.";
  }
  return null;
}

export function QuickActionsManager() {
  const [items, setItems] = useState<AdminQuickActionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listQuickActions());
      setListError(null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Nie udało się wczytać akcji.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  // Auto-suggest the key from the name while creating (until the key is edited).
  function onNameChange(value: string) {
    setForm((prev) => ({
      ...prev,
      namePl: value,
      key: prev.keyTouched ? prev.key : slugify(value),
    }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
  }

  function startEdit(action: AdminQuickActionDto) {
    setForm(formFromAction(action));
    setEditingId(action.id);
    setFormError(null);
  }

  async function submit() {
    const error = validate(form);
    if (error) {
      setFormError(error);
      return;
    }

    const payload: QuickActionPayload = {
      key: form.key.trim(),
      namePl: form.namePl.trim(),
      promptTemplate: form.promptTemplate.trim(),
      customInput: buildCustomInput(form),
      usesDatabase: form.usesDatabase,
      usesWebSearch: form.usesWebSearch,
      displayOrder: Number.parseInt(form.displayOrder, 10) || 0,
      isEnabled: form.isEnabled,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editingId === null) {
        await createQuickAction(payload);
      } else {
        await updateQuickAction(editingId, payload);
      }
      resetForm();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Nie udało się zapisać akcji.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(action: AdminQuickActionDto) {
    if (!window.confirm(`Usunąć akcję „${action.namePl}”?`)) return;
    try {
      await deleteQuickAction(action.id);
      if (editingId === action.id) resetForm();
      await refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Nie udało się usunąć akcji.");
    }
  }

  return (
    <div className={styles.manageGrid}>
      <div className={styles.tableCard}>
        <div className={styles.manageHead}>
          <div className={styles.tableCardTitle}>Szybkie akcje</div>
          <span className={styles.manageCount}>{items.length} pozycji</span>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>NAZWA</th>
              <th className={styles.th}>KLUCZ</th>
              <th className={styles.th}>POLE WEJŚCIA</th>
              <th className={styles.th}>STATUS</th>
              <th className={styles.th} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={styles.emptyCell} colSpan={5}>
                  Ładowanie…
                </td>
              </tr>
            ) : listError ? (
              <tr>
                <td className={styles.emptyCell} colSpan={5}>
                  {listError}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className={styles.emptyCell} colSpan={5}>
                  Brak szybkich akcji — dodaj pierwszą w formularzu obok.
                </td>
              </tr>
            ) : (
              items.map((action) => (
                <tr className={styles.tr} key={action.id}>
                  <td className={styles.tdName}>{action.namePl}</td>
                  <td className={styles.tdMonoSmall}>{action.key}</td>
                  <td className={styles.tdSecondary}>
                    {"type" in action.customInput ? action.customInput.label : "—"}
                  </td>
                  <td className={styles.td}>
                    <span
                      className={action.isEnabled ? styles.pillActive : styles.pillIdle}
                    >
                      {action.isEnabled ? "Włączona" : "Wyłączona"}
                    </span>
                  </td>
                  <td className={styles.tdActions}>
                    <button
                      type="button"
                      className={`${styles.rowAction} ${styles.actionEdit}`}
                      onClick={() => startEdit(action)}
                    >
                      Edytuj
                    </button>
                    <button
                      type="button"
                      className={`${styles.rowAction} ${styles.actionDelete}`}
                      onClick={() => void remove(action)}
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
        <div className={styles.formTitle}>
          {editingId === null ? "Nowa szybka akcja" : "Edytuj szybką akcję"}
        </div>

        <label className={styles.formLabel}>Nazwa</label>
        <input
          className={styles.input}
          placeholder="np. Zamówienia kontrahenta"
          value={form.namePl}
          onChange={(e) => onNameChange(e.target.value)}
        />

        <label className={styles.formLabel}>Klucz</label>
        <input
          className={styles.input}
          placeholder="np. zamowienia_kontrahenta"
          value={form.key}
          onChange={(e) => patchForm({ key: e.target.value, keyTouched: true })}
        />

        <label className={styles.formLabel}>Szablon promptu</label>
        <textarea
          className={styles.textarea}
          placeholder="np. Pokaż zamówienia kontrahenta {kontrahent} z ostatnich 90 dni"
          value={form.promptTemplate}
          onChange={(e) => patchForm({ promptTemplate: e.target.value })}
        />

        <label className={styles.formLabel}>Pole wejścia</label>
        <select
          className={styles.select}
          value={form.inputType}
          onChange={(e) => patchForm({ inputType: e.target.value as InputType })}
        >
          <option value="none">Brak</option>
          <option value="text">Tekst</option>
          <option value="select_from_db">Lista z bazy</option>
        </select>

        {form.inputType !== "none" ? (
          <>
            <label className={styles.formLabel}>Etykieta pola</label>
            <input
              className={styles.input}
              placeholder="np. Kontrahent"
              value={form.label}
              onChange={(e) => patchForm({ label: e.target.value })}
            />
          </>
        ) : null}

        {form.inputType === "text" ? (
          <>
            <label className={styles.formLabel}>Placeholder (opcjonalny)</label>
            <input
              className={styles.input}
              placeholder="np. Wpisz nazwę…"
              value={form.placeholder}
              onChange={(e) => patchForm({ placeholder: e.target.value })}
            />
          </>
        ) : null}

        {form.inputType === "select_from_db" ? (
          <>
            <label className={styles.formLabel}>Zapytanie SQL (SELECT)</label>
            <textarea
              className={styles.textarea}
              placeholder="np. SELECT kod, nazwa FROM kontrahenci ORDER BY nazwa"
              value={form.query}
              onChange={(e) => patchForm({ query: e.target.value })}
            />
            <div className={styles.fieldGrid}>
              <div>
                <label className={styles.formLabel}>Kolumna wartości</label>
                <input
                  className={styles.input}
                  placeholder="np. kod"
                  value={form.valueColumn}
                  onChange={(e) => patchForm({ valueColumn: e.target.value })}
                />
              </div>
              <div>
                <label className={styles.formLabel}>Kolumna etykiety</label>
                <input
                  className={styles.input}
                  placeholder="np. nazwa"
                  value={form.labelColumn}
                  onChange={(e) => patchForm({ labelColumn: e.target.value })}
                />
              </div>
            </div>
          </>
        ) : null}

        {form.inputType !== "none" ? (
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => patchForm({ required: e.target.checked })}
            />
            Pole wymagane
          </label>
        ) : null}

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={form.usesDatabase}
            onChange={(e) => patchForm({ usesDatabase: e.target.checked })}
          />
          Korzysta z bazy danych (SQL)
        </label>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={form.usesWebSearch}
            onChange={(e) => patchForm({ usesWebSearch: e.target.checked })}
          />
          Wyszukiwanie w internecie
        </label>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(e) => patchForm({ isEnabled: e.target.checked })}
          />
          Włączona
        </label>

        <label className={styles.formLabel}>Kolejność</label>
        <input
          className={`${styles.input} ${styles.orderField}`}
          type="number"
          min={0}
          value={form.displayOrder}
          onChange={(e) => patchForm({ displayOrder: e.target.value })}
        />

        {formError ? <div className={styles.formError}>{formError}</div> : null}

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving
              ? "Zapisywanie…"
              : editingId === null
                ? "Dodaj akcję"
                : "Zapisz zmiany"}
          </button>
          {editingId !== null ? (
            <button
              type="button"
              className={styles.ghostButton}
              onClick={resetForm}
              disabled={saving}
            >
              Anuluj
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
