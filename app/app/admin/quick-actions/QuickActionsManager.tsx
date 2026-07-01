"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildFetchSql,
  type AdminQuickActionDto,
  type CustomInput,
  type QuickActionPayload,
} from "@/lib/api/quick-actions-types";
import { Combobox } from "../../_components/Combobox";
import { FieldHelp } from "../../_components/FieldHelp";
import styles from "../AdminView.module.css";
import {
  createQuickAction,
  deleteQuickAction,
  listQuickActions,
  updateQuickAction,
} from "./adminApi";
import { fetchDbSchema, type DbTable } from "./schemaApi";

type InputType = "none" | "text" | "row_from_table";

interface FormState {
  namePl: string;
  key: string;
  keyTouched: boolean;
  promptTemplate: string;
  inputType: InputType;
  label: string;
  placeholder: string;
  required: boolean;
  table: string;
  idColumn: string;
  fetchColumns: string[];
  searchColumns: string[];
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
  required: false,
  table: "",
  idColumn: "",
  fetchColumns: [],
  searchColumns: [],
  usesWebSearch: false,
  isEnabled: true,
  displayOrder: "0",
};

const HELP = {
  name: "Etykieta akcji — pojawia się na przycisku w czacie i w tabeli poniżej.",
  key: "Unikalny identyfikator w adresie (małe litery, cyfry, podkreślenia). Podpowiadany z nazwy; po utworzeniu lepiej nie zmieniać.",
  prompt:
    "Instrukcja dla AI. Może zawierać {placeholder}, w który wstawiana jest wartość pola wejścia. Dla „Wiersza z tabeli” opisuje, co AI ma zrobić z danymi wybranego rekordu.",
  inputType:
    "Brak — akcja rusza od razu. Tekst — użytkownik wpisuje wartość. Wiersz z tabeli — użytkownik wyszukuje i wybiera rekord z bazy.",
  label: "Napis nad polem, które zobaczy użytkownik w czacie (np. „Kontrahent”).",
  placeholder: "Podpowiedź w pustym polu tekstowym (opcjonalna).",
  table: "Tabela ERP, z której użytkownik wybierze rekord.",
  fetchColumns:
    "Kolumny pobierane dla wybranego rekordu i przekazywane AI. Domyślnie wszystkie — odznacz zbędne.",
  searchColumns:
    "Identyfikator jest zawsze przeszukiwany (i się nie odznacza). Dodatkowo wybierz do 2 kolumn (np. nazwa), po których działa wyszukiwarka w czacie i które widać w wynikach.",
  idColumn:
    "Kolumna identyfikująca rekord (klucz), używana w zapytaniu. Wykrywana automatycznie z klucza głównego tabeli.",
  required: "Czy użytkownik musi podać wartość, by uruchomić akcję.",
  usesWebSearch:
    "Udostępnia AI wyszukiwanie w internecie (dotyczy akcji tekstowych / bez pola).",
  enabled: "Tylko włączone akcje są widoczne jako przyciski w czacie.",
  order: "Kolejność przycisków w pasku szybkich akcji (rosnąco).",
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function formFromAction(action: AdminQuickActionDto): FormState {
  const ci = action.customInput;
  const base: FormState = {
    ...EMPTY_FORM,
    namePl: action.namePl,
    key: action.key,
    keyTouched: true,
    promptTemplate: action.promptTemplate,
    usesWebSearch: action.usesWebSearch,
    isEnabled: action.isEnabled,
    displayOrder: String(action.displayOrder),
  };
  if (!("type" in ci)) return base;
  if (ci.type === "text") {
    return {
      ...base,
      inputType: "text",
      label: ci.label,
      placeholder: ci.placeholder ?? "",
      required: ci.required ?? false,
    };
  }
  return {
    ...base,
    inputType: "row_from_table",
    label: ci.label,
    table: ci.table,
    idColumn: ci.idColumn,
    fetchColumns: ci.fetchColumns,
    searchColumns: ci.searchColumns,
    required: ci.required ?? false,
  };
}

function buildCustomInput(form: FormState): CustomInput {
  if (form.inputType === "text") {
    return {
      type: "text",
      label: form.label.trim(),
      ...(form.placeholder.trim() ? { placeholder: form.placeholder.trim() } : {}),
      required: form.required,
    };
  }
  if (form.inputType === "row_from_table") {
    return {
      type: "row_from_table",
      label: form.label.trim(),
      table: form.table,
      idColumn: form.idColumn,
      fetchColumns: form.fetchColumns,
      searchColumns: form.searchColumns,
      required: form.required,
    };
  }
  return {};
}

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
  if (form.inputType === "row_from_table") {
    if (!form.table) return "Wybierz tabelę.";
    if (!form.idColumn) return "Brak kolumny identyfikatora dla tej tabeli.";
    if (form.fetchColumns.length === 0) return "Zaznacz co najmniej jedną kolumnę do pobrania.";
  }
  return null;
}

export function QuickActionsManager() {
  const [items, setItems] = useState<AdminQuickActionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [tables, setTables] = useState<DbTable[]>([]);
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

  useEffect(() => {
    void (async () => {
      try {
        setTables(await fetchDbSchema());
      } catch {
        // Table picker stays empty; the admin can still edit other fields.
      }
    })();
  }, []);

  const tableInfo = useMemo(
    () => tables.find((t) => t.table === form.table) ?? null,
    [tables, form.table],
  );
  const columns = tableInfo?.columns ?? [];
  const tableOptions = useMemo(
    () => tables.map((t) => ({ value: t.table, label: t.table })),
    [tables],
  );

  const sqlPreview =
    form.inputType === "row_from_table" &&
    form.table &&
    form.idColumn &&
    form.fetchColumns.length > 0
      ? buildFetchSql({
          table: form.table,
          idColumn: form.idColumn,
          fetchColumns: form.fetchColumns,
        })
      : null;

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function onNameChange(value: string) {
    setForm((prev) => ({
      ...prev,
      namePl: value,
      key: prev.keyTouched ? prev.key : slugify(value),
    }));
  }

  function onTableChange(table: string) {
    const info = tables.find((t) => t.table === table);
    const cols = info?.columns ?? [];
    const pk = info?.primaryKey ?? cols[0] ?? "";
    setForm((prev) => ({
      ...prev,
      table,
      idColumn: pk,
      fetchColumns: cols,
      // The id is always searchable; these are the extra columns (max 2).
      searchColumns: [],
    }));
  }

  function toggleFetchColumn(col: string) {
    setForm((prev) => ({
      ...prev,
      fetchColumns: prev.fetchColumns.includes(col)
        ? prev.fetchColumns.filter((c) => c !== col)
        : [...prev.fetchColumns, col],
    }));
  }

  function toggleSearchColumn(col: string) {
    setForm((prev) => {
      // The id is always searchable and is never stored in searchColumns.
      if (col === prev.idColumn) return prev;
      if (prev.searchColumns.includes(col)) {
        return { ...prev, searchColumns: prev.searchColumns.filter((c) => c !== col) };
      }
      if (prev.searchColumns.length >= 2) return prev;
      return { ...prev, searchColumns: [...prev.searchColumns, col] };
    });
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
      usesDatabase: form.inputType === "row_from_table",
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

  function inputSummary(ci: CustomInput): string {
    if (!("type" in ci)) return "—";
    if (ci.type === "text") return `${ci.label} (tekst)`;
    return `${ci.label} (${ci.table})`;
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
                  <td className={styles.tdSecondary}>{inputSummary(action.customInput)}</td>
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

        <div className={styles.labelRow}>
          Nazwa <FieldHelp text={HELP.name} />
        </div>
        <input
          className={styles.input}
          placeholder="np. Karta kontrahenta"
          value={form.namePl}
          onChange={(e) => onNameChange(e.target.value)}
        />

        <div className={styles.labelRow}>
          Klucz <FieldHelp text={HELP.key} />
        </div>
        <input
          className={styles.input}
          placeholder="np. karta_kontrahenta"
          value={form.key}
          onChange={(e) => patchForm({ key: e.target.value, keyTouched: true })}
        />

        <div className={styles.labelRow}>
          Szablon promptu <FieldHelp text={HELP.prompt} />
        </div>
        <textarea
          className={styles.textarea}
          placeholder="np. Podsumuj dane kontrahenta i oceń wiarygodność płatniczą."
          value={form.promptTemplate}
          onChange={(e) => patchForm({ promptTemplate: e.target.value })}
        />

        <div className={styles.labelRow}>
          Pole wejścia <FieldHelp text={HELP.inputType} />
        </div>
        <select
          className={styles.select}
          value={form.inputType}
          onChange={(e) => patchForm({ inputType: e.target.value as InputType })}
        >
          <option value="none">Brak</option>
          <option value="text">Tekst</option>
          <option value="row_from_table">Wiersz z tabeli</option>
        </select>

        {form.inputType !== "none" ? (
          <>
            <div className={styles.labelRow}>
              Etykieta pola <FieldHelp text={HELP.label} />
            </div>
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
            <div className={styles.labelRow}>
              Placeholder (opcjonalny) <FieldHelp text={HELP.placeholder} />
            </div>
            <input
              className={styles.input}
              placeholder="np. Wpisz nazwę…"
              value={form.placeholder}
              onChange={(e) => patchForm({ placeholder: e.target.value })}
            />
          </>
        ) : null}

        {form.inputType === "row_from_table" ? (
          <>
            <div className={styles.labelRow}>
              Tabela <FieldHelp text={HELP.table} />
            </div>
            <Combobox
              value={form.table}
              onChange={(v) => onTableChange(v)}
              options={tableOptions}
              placeholder="Wybierz tabelę…"
              emptyText="Brak tabel"
            />

            {form.table ? (
              <>
                <div className={styles.labelRow}>
                  Identyfikator <FieldHelp text={HELP.idColumn} />
                </div>
                {tableInfo?.primaryKey ? (
                  <div className={styles.idReadonly}>{form.idColumn}</div>
                ) : (
                  <Combobox
                    value={form.idColumn}
                    onChange={(v) => patchForm({ idColumn: v })}
                    options={columns.map((c) => ({ value: c, label: c }))}
                    placeholder="Wybierz kolumnę identyfikatora…"
                  />
                )}

                <div className={styles.labelRow}>
                  Kolumny do pobrania <FieldHelp text={HELP.fetchColumns} />
                </div>
                <div className={styles.columnList}>
                  {columns.map((col) => (
                    <label className={styles.columnItem} key={col}>
                      <input
                        type="checkbox"
                        checked={form.fetchColumns.includes(col)}
                        onChange={() => toggleFetchColumn(col)}
                      />
                      <span className={styles.columnMono}>{col}</span>
                    </label>
                  ))}
                </div>

                <div className={styles.labelRow}>
                  Kolumny wyszukiwania (identyfikator + max 2){" "}
                  <FieldHelp text={HELP.searchColumns} />
                </div>
                <div className={styles.columnList}>
                  {columns.map((col) => {
                    const isId = col === form.idColumn;
                    const checked = isId || form.searchColumns.includes(col);
                    const disabled =
                      isId || (!checked && form.searchColumns.length >= 2);
                    return (
                      <label className={styles.columnItem} key={col}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleSearchColumn(col)}
                        />
                        <span className={styles.columnMono}>{col}</span>
                        {isId ? (
                          <span className={styles.idTag}>identyfikator</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>

                {sqlPreview ? (
                  <>
                    <div className={styles.labelRow}>Podgląd zapytania</div>
                    <pre className={styles.sqlPreview}>{sqlPreview}</pre>
                  </>
                ) : null}
              </>
            ) : null}
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
            <FieldHelp text={HELP.required} />
          </label>
        ) : null}

        {form.inputType !== "row_from_table" ? (
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.usesWebSearch}
              onChange={(e) => patchForm({ usesWebSearch: e.target.checked })}
            />
            Wyszukiwanie w internecie
            <FieldHelp text={HELP.usesWebSearch} />
          </label>
        ) : null}

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(e) => patchForm({ isEnabled: e.target.checked })}
          />
          Włączona
          <FieldHelp text={HELP.enabled} />
        </label>

        <div className={styles.labelRow}>
          Kolejność <FieldHelp text={HELP.order} />
        </div>
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
