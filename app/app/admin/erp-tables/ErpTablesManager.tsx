"use client";

import { useEffect, useMemo, useState } from "react";

import { renderErpSchemaText } from "@/lib/erp-schema/erp-schema-core";
import {
  DEFAULT_ERP_MODEL,
  type ColumnType,
  type ErpColumnModel,
  type ErpTableModel,
} from "@/lib/erp-schema/model";
import adminStyles from "../AdminView.module.css";
import styles from "./ErpTablesManager.module.css";
import { fetchErpTables, saveErpTables } from "./erpTablesApi";

const COLUMN_TYPES: ColumnType[] = ["text", "integer", "numeric", "date"];

const emptyColumn = (): ErpColumnModel => ({
  name: "",
  label: "",
  type: "text",
  pk: false,
  searchable: true,
  filterable: true,
  sortable: true,
});

const emptyTable = (): ErpTableModel => ({
  key: "",
  label: "",
  description: "",
  synonyms: [],
  joins: [],
  notes: null,
  columns: [emptyColumn()],
});

/** Trims fields and drops empty synonyms/joins — the shape sent to the API. */
function normalize(tables: ErpTableModel[]): ErpTableModel[] {
  return tables.map((t) => ({
    key: t.key.trim(),
    label: t.label.trim(),
    description: t.description.trim(),
    synonyms: t.synonyms.map((s) => s.trim()).filter(Boolean),
    joins: t.joins.map((s) => s.trim()).filter(Boolean),
    notes: t.notes && t.notes.trim().length > 0 ? t.notes.trim() : null,
    columns: t.columns.map((c) => ({
      ...c,
      name: c.name.trim(),
      label: c.label.trim(),
    })),
  }));
}

function move<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir;
  if (next < 0 || next >= arr.length) return arr;
  const copy = arr.slice();
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}

export function ErpTablesManager() {
  const [tables, setTables] = useState<ErpTableModel[]>([]);
  const [baseline, setBaseline] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchErpTables()
      .then((data) => {
        if (cancelled) return;
        setTables(data.tables);
        setBaseline(JSON.stringify(data.tables));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = tables[activeIndex] ?? null;
  const dirty = useMemo(
    () => JSON.stringify(tables) !== baseline,
    [tables, baseline],
  );
  const preview = useMemo(
    () => (tables.length > 0 ? renderErpSchemaText(normalize(tables)) : ""),
    [tables],
  );

  // ── mutation helpers (immutable) ─────────────────────────────────────────
  function patchTable(index: number, patch: Partial<ErpTableModel>) {
    setTables((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    );
  }

  function patchColumn(
    tableIndex: number,
    colIndex: number,
    patch: Partial<ErpColumnModel>,
  ) {
    setTables((prev) =>
      prev.map((t, i) =>
        i === tableIndex
          ? {
              ...t,
              columns: t.columns.map((c, ci) =>
                ci === colIndex ? { ...c, ...patch } : c,
              ),
            }
          : t,
      ),
    );
  }

  function addTable() {
    setTables((prev) => [...prev, emptyTable()]);
    setActiveIndex(tables.length);
    resetMessages();
  }

  function removeTable(index: number) {
    setTables((prev) => prev.filter((_, i) => i !== index));
    setActiveIndex((cur) => Math.max(0, cur > index ? cur - 1 : cur));
    resetMessages();
  }

  function moveTable(index: number, dir: -1 | 1) {
    setTables((prev) => move(prev, index, dir));
    setActiveIndex((cur) => {
      const next = index + dir;
      if (cur === index && next >= 0 && next < tables.length) return next;
      return cur;
    });
  }

  function addColumn(tableIndex: number) {
    setTables((prev) =>
      prev.map((t, i) =>
        i === tableIndex ? { ...t, columns: [...t.columns, emptyColumn()] } : t,
      ),
    );
  }

  function removeColumn(tableIndex: number, colIndex: number) {
    setTables((prev) =>
      prev.map((t, i) =>
        i === tableIndex
          ? { ...t, columns: t.columns.filter((_, ci) => ci !== colIndex) }
          : t,
      ),
    );
  }

  function moveColumn(tableIndex: number, colIndex: number, dir: -1 | 1) {
    setTables((prev) =>
      prev.map((t, i) =>
        i === tableIndex ? { ...t, columns: move(t.columns, colIndex, dir) } : t,
      ),
    );
  }

  function resetMessages() {
    setError(null);
    setNotice(null);
    setWarnings([]);
  }

  function discard() {
    setTables(JSON.parse(baseline) as ErpTableModel[]);
    setActiveIndex(0);
    resetMessages();
  }

  function loadDefaults() {
    setTables(JSON.parse(JSON.stringify(DEFAULT_ERP_MODEL)) as ErpTableModel[]);
    setActiveIndex(0);
    resetMessages();
  }

  async function handleSave() {
    setSaving(true);
    resetMessages();
    try {
      const payload = { tables: normalize(tables) };
      const data = await saveErpTables(payload);
      setTables(data.tables);
      setBaseline(JSON.stringify(data.tables));
      setWarnings(data.warnings ?? []);
      setNotice("Zapisano model tabel.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className={adminStyles.overviewState}>Wczytywanie modelu tabel…</p>;
  }

  if (error && tables.length === 0) {
    return <p className={adminStyles.overviewError}>{error}</p>;
  }

  return (
    <>
      <p className={adminStyles.sectionIntro}>
        Jeden model tabel ERP zasilający i schemat wysyłany do modelu AI
        (znacznik <code>{"{{ERP_SCHEMA}}"}</code>), i ręczną przeglądarkę „Dane”.
        Zapisana zmiana działa w ciągu minuty — bez wdrożenia. Bezpieczeństwo
        zapytań nie zależy od tej konfiguracji: dostęp jest wyłącznie do odczytu,
        a nieistniejące kolumny są pomijane.
      </p>

      <div className={styles.layout}>
        {/* ── Table list ─────────────────────────────────────────────── */}
        <nav className={styles.tableNav} aria-label="Lista tabel">
          {tables.map((table, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={
                index === activeIndex ? styles.navItemActive : styles.navItem
              }
            >
              <span className={styles.navKey}>{table.key || "(nowa tabela)"}</span>
              <span className={styles.navMeta}>{table.columns.length} kol.</span>
            </button>
          ))}
          <button type="button" className={styles.addTable} onClick={addTable}>
            + Dodaj tabelę
          </button>
        </nav>

        {/* ── Editor ─────────────────────────────────────────────────── */}
        {active ? (
          <div className={styles.editor}>
            <div className={styles.headRow}>
              <h3 className={adminStyles.panelTitle}>
                {active.key || "Nowa tabela"}
              </h3>
              <div className={styles.headActions}>
                <button
                  type="button"
                  className={styles.moveBtn}
                  disabled={activeIndex === 0}
                  onClick={() => moveTable(activeIndex, -1)}
                  aria-label="Przenieś tabelę w górę"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.moveBtn}
                  disabled={activeIndex === tables.length - 1}
                  onClick={() => moveTable(activeIndex, 1)}
                  aria-label="Przenieś tabelę w dół"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.removeText}
                  onClick={() => removeTable(activeIndex)}
                >
                  Usuń tabelę
                </button>
              </div>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={adminStyles.formLabel}>Klucz (nazwa tabeli)</span>
                <input
                  className={adminStyles.input}
                  value={active.key}
                  spellCheck={false}
                  placeholder="np. kontrahenci"
                  onChange={(e) => patchTable(activeIndex, { key: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={adminStyles.formLabel}>Etykieta (Dane)</span>
                <input
                  className={adminStyles.input}
                  value={active.label}
                  onChange={(e) =>
                    patchTable(activeIndex, { label: e.target.value })
                  }
                />
              </label>
            </div>

            <span className={adminStyles.formLabel}>Opis</span>
            <input
              className={adminStyles.input}
              value={active.description}
              onChange={(e) =>
                patchTable(activeIndex, { description: e.target.value })
              }
            />

            <span className={adminStyles.formLabel}>
              Synonimy (dla AI, po przecinku)
            </span>
            <input
              className={adminStyles.input}
              value={active.synonyms.join(", ")}
              spellCheck={false}
              placeholder="klient, kontrahent, dostawca"
              onChange={(e) =>
                patchTable(activeIndex, {
                  synonyms: e.target.value.split(","),
                })
              }
            />

            <span className={adminStyles.formLabel}>
              Złączenia (dla AI, jedno na wiersz)
            </span>
            <textarea
              className={adminStyles.textarea}
              value={active.joins.join("\n")}
              spellCheck={false}
              placeholder="kontrahent_kod -> kontrahenci.kod"
              onChange={(e) =>
                patchTable(activeIndex, { joins: e.target.value.split("\n") })
              }
            />

            <span className={adminStyles.formLabel}>Notatki (dla AI, opcjonalnie)</span>
            <textarea
              className={adminStyles.textarea}
              value={active.notes ?? ""}
              onChange={(e) =>
                patchTable(activeIndex, { notes: e.target.value || null })
              }
            />

            {/* ── Columns ──────────────────────────────────────────────── */}
            <div className={styles.colHead}>
              <span className={adminStyles.formLabel}>Kolumny</span>
              <span className={adminStyles.manageCount}>
                {active.columns.length}
              </span>
            </div>

            <div className={styles.colTable}>
              <div className={styles.colHeaderRow}>
                <span>Nazwa</span>
                <span>Etykieta</span>
                <span>Typ</span>
                <span className={styles.flagCol}>PK</span>
                <span className={styles.flagCol}>Szuk.</span>
                <span className={styles.flagCol}>Filtr</span>
                <span className={styles.flagCol}>Sort</span>
                <span />
              </div>

              {active.columns.map((col, ci) => (
                <div key={ci} className={styles.colRow}>
                  <input
                    className={adminStyles.input}
                    value={col.name}
                    spellCheck={false}
                    placeholder="kolumna"
                    onChange={(e) =>
                      patchColumn(activeIndex, ci, { name: e.target.value })
                    }
                  />
                  <input
                    className={adminStyles.input}
                    value={col.label}
                    placeholder="Etykieta"
                    onChange={(e) =>
                      patchColumn(activeIndex, ci, { label: e.target.value })
                    }
                  />
                  <select
                    className={adminStyles.select}
                    value={col.type}
                    onChange={(e) =>
                      patchColumn(activeIndex, ci, {
                        type: e.target.value as ColumnType,
                      })
                    }
                  >
                    {COLUMN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    type="checkbox"
                    className={styles.flagCol}
                    checked={col.pk}
                    aria-label="Klucz główny"
                    onChange={(e) =>
                      patchColumn(activeIndex, ci, { pk: e.target.checked })
                    }
                  />
                  <input
                    type="checkbox"
                    className={styles.flagCol}
                    checked={col.searchable}
                    aria-label="Wyszukiwalna"
                    onChange={(e) =>
                      patchColumn(activeIndex, ci, {
                        searchable: e.target.checked,
                      })
                    }
                  />
                  <input
                    type="checkbox"
                    className={styles.flagCol}
                    checked={col.filterable}
                    aria-label="Filtrowalna"
                    onChange={(e) =>
                      patchColumn(activeIndex, ci, {
                        filterable: e.target.checked,
                      })
                    }
                  />
                  <input
                    type="checkbox"
                    className={styles.flagCol}
                    checked={col.sortable}
                    aria-label="Sortowalna"
                    onChange={(e) =>
                      patchColumn(activeIndex, ci, { sortable: e.target.checked })
                    }
                  />
                  <div className={styles.colActions}>
                    <button
                      type="button"
                      className={styles.moveBtn}
                      disabled={ci === 0}
                      onClick={() => moveColumn(activeIndex, ci, -1)}
                      aria-label="W górę"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.moveBtn}
                      disabled={ci === active.columns.length - 1}
                      onClick={() => moveColumn(activeIndex, ci, 1)}
                      aria-label="W dół"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={styles.removeCol}
                      disabled={active.columns.length === 1}
                      onClick={() => removeColumn(activeIndex, ci)}
                      aria-label="Usuń kolumnę"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className={adminStyles.ghostButton}
              onClick={() => addColumn(activeIndex)}
            >
              + Dodaj kolumnę
            </button>

            {/* ── Save row ─────────────────────────────────────────────── */}
            <div className={adminStyles.formActions}>
              <button
                type="button"
                className={adminStyles.ghostButton}
                disabled={saving}
                onClick={loadDefaults}
              >
                Przywróć domyślne
              </button>
              <button
                type="button"
                className={adminStyles.ghostButton}
                disabled={saving || !dirty}
                onClick={discard}
              >
                Odrzuć zmiany
              </button>
              <button
                type="button"
                className={adminStyles.submitButton}
                disabled={saving || !dirty}
                onClick={handleSave}
              >
                {saving ? "Zapisywanie…" : "Zapisz model"}
              </button>
            </div>

            {error ? <p className={adminStyles.formError}>{error}</p> : null}
            {notice ? <p className={styles.notice}>{notice}</p> : null}
            {warnings.length > 0 ? (
              <div className={styles.warning}>
                <strong>Zapisano, ale uwaga:</strong>
                <ul>
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* ── Schema preview ───────────────────────────────────────── */}
            <section className={styles.previewBox}>
              <h4 className={styles.previewTitle}>
                Podgląd <code>{"{{ERP_SCHEMA}}"}</code> (to widzi model AI)
              </h4>
              <pre className={styles.preview}>{preview}</pre>
            </section>
          </div>
        ) : (
          <p className={adminStyles.overviewState}>
            Brak tabel. Dodaj pierwszą tabelę, aby rozpocząć.
          </p>
        )}
      </div>
    </>
  );
}
