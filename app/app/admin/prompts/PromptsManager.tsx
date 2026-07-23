"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ERP_SCHEMA_PLACEHOLDER } from "@/lib/ai/prompt-defaults";
import type {
  AdminPromptDto,
  PromptVersionDto,
} from "@/lib/api/prompts-types";
import adminStyles from "../AdminView.module.css";
import styles from "./PromptsManager.module.css";
import { fetchPromptHistory, listPrompts, savePrompt } from "./promptsApi";

const MAX_CHARS = 20000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PromptsManager() {
  const [prompts, setPrompts] = useState<AdminPromptDto[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [versions, setVersions] = useState<PromptVersionDto[]>([]);
  const [openVersionId, setOpenVersionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = useMemo(
    () => prompts.find((p) => p.key === activeKey) ?? null,
    [prompts, activeKey],
  );

  useEffect(() => {
    let cancelled = false;
    listPrompts()
      .then((rows) => {
        if (cancelled) return;
        setPrompts(rows);
        setActiveKey((current) => current ?? rows[0]?.key ?? null);
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

  const loadHistory = useCallback((key: string) => {
    setOpenVersionId(null);
    fetchPromptHistory(key)
      .then((data) => setVersions(data.versions))
      .catch(() => setVersions([]));
  }, []);

  // Reset the editor whenever the selected prompt changes, so a half-typed
  // draft never leaks onto a different prompt.
  useEffect(() => {
    if (!active) return;
    setDraft(active.content);
    setError(null);
    setNotice(null);
    loadHistory(active.key);
  }, [active, loadHistory]);

  const dirty = active !== null && draft !== active.content;
  const isDefault = active !== null && draft === active.defaultContent;
  const missingSchema =
    active?.supportsSchemaPlaceholder === true &&
    !draft.includes(ERP_SCHEMA_PLACEHOLDER);

  async function handleSave(content: string, successMessage: string) {
    if (!active) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await savePrompt(active.key, content);
      setPrompts((rows) =>
        rows.map((row) => (row.key === updated.key ? updated : row)),
      );
      setDraft(updated.content);
      setNotice(successMessage);
      loadHistory(active.key);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className={adminStyles.overviewState}>Wczytywanie promptów…</p>;
  }

  if (error && prompts.length === 0) {
    return <p className={adminStyles.overviewError}>{error}</p>;
  }

  return (
    <>
      <p className={adminStyles.sectionIntro}>
        Prompty systemowe wysyłane do modelu. Zapisana zmiana działa w ciągu
        minuty — bez wdrożenia. Każdy zapis tworzy nową wersję, więc poprzednie
        brzmienie zawsze można przywrócić.
      </p>

      <div className={styles.layout}>
        <nav className={styles.list} aria-label="Lista promptów">
          {prompts.map((prompt) => (
            <button
              key={prompt.key}
              type="button"
              onClick={() => setActiveKey(prompt.key)}
              className={
                prompt.key === activeKey ? styles.listItemActive : styles.listItem
              }
            >
              <span className={styles.listLabel}>{prompt.label}</span>
              <span className={styles.listMeta}>
                {prompt.version === null
                  ? "domyślny (z kodu)"
                  : `wersja ${prompt.version}`}
              </span>
            </button>
          ))}
        </nav>

        {active ? (
          <div className={styles.editor}>
            <div className={styles.editorHead}>
              <h3 className={adminStyles.panelTitle}>{active.label}</h3>
              <p className={styles.editorDesc}>{active.description}</p>
              <p className={styles.editorMeta}>
                {active.version === null
                  ? "Nigdy nie edytowany — obowiązuje treść domyślna z kodu."
                  : `Wersja ${active.version} · zapisano ${formatDate(
                      active.updatedAt!,
                    )}${
                      active.updatedByEmail
                        ? ` · ${active.updatedByEmail}`
                        : " · zasiew"
                    }`}
              </p>
            </div>

            {active.supportsSchemaPlaceholder ? (
              <p className={styles.hint}>
                <code>{ERP_SCHEMA_PLACEHOLDER}</code> jest podmieniane na aktualny
                schemat bazy ERP (~2000 tokenów) z kodu. Zostaw ten znacznik —
                dzięki niemu schemat nie rozjedzie się z prawdziwymi tabelami.
              </p>
            ) : null}

            {missingSchema ? (
              <p className={styles.warning}>
                Brakuje znacznika <code>{ERP_SCHEMA_PLACEHOLDER}</code>. Bez niego
                model nie zobaczy schematu bazy i nie ułoży poprawnego SQL, a
                prompt może spaść poniżej progu cache’owania (2048 tokenów), co
                podniesie koszt każdego zapytania.
              </p>
            ) : null}

            <textarea
              className={styles.promptArea}
              value={draft}
              spellCheck={false}
              maxLength={MAX_CHARS}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={`Treść promptu: ${active.label}`}
            />

            <div className={styles.editorFoot}>
              <span className={styles.counter}>
                {draft.length.toLocaleString("pl-PL")} / {MAX_CHARS.toLocaleString("pl-PL")} znaków
                {isDefault ? " · zgodny z domyślnym" : ""}
              </span>
              <div className={adminStyles.formActions}>
                <button
                  type="button"
                  className={adminStyles.ghostButton}
                  disabled={saving || draft === active.defaultContent}
                  onClick={() => setDraft(active.defaultContent)}
                >
                  Przywróć domyślny
                </button>
                <button
                  type="button"
                  className={adminStyles.ghostButton}
                  disabled={saving || !dirty}
                  onClick={() => setDraft(active.content)}
                >
                  Odrzuć zmiany
                </button>
                <button
                  type="button"
                  className={adminStyles.submitButton}
                  disabled={saving || !dirty || draft.trim().length === 0}
                  onClick={() => handleSave(draft, "Zapisano nową wersję.")}
                >
                  {saving ? "Zapisywanie…" : "Zapisz jako nową wersję"}
                </button>
              </div>
            </div>

            {error ? <p className={adminStyles.formError}>{error}</p> : null}
            {notice ? <p className={styles.notice}>{notice}</p> : null}

            <section className={styles.history}>
              <h4 className={styles.historyTitle}>
                Historia wersji
                <span className={adminStyles.manageCount}>{versions.length}</span>
              </h4>
              {versions.length === 0 ? (
                <p className={styles.historyEmpty}>
                  Brak zapisanych wersji — obowiązuje treść domyślna z kodu.
                </p>
              ) : (
                <ul className={styles.historyList}>
                  {versions.map((version, index) => (
                    <li key={version.id} className={styles.historyRow}>
                      <div className={styles.historyInfo}>
                        <span className={styles.historyVersion}>
                          v{version.version}
                          {index === 0 ? (
                            <span className={adminStyles.pillActive}>aktywna</span>
                          ) : null}
                        </span>
                        <span className={styles.historyDate}>
                          {formatDate(version.createdAt)}
                          {version.createdByEmail
                            ? ` · ${version.createdByEmail}`
                            : " · zasiew"}
                        </span>
                      </div>
                      <div className={styles.historyActions}>
                        <button
                          type="button"
                          className={adminStyles.rowAction}
                          onClick={() =>
                            setOpenVersionId((current) =>
                              current === version.id ? null : version.id,
                            )
                          }
                        >
                          {openVersionId === version.id ? "Ukryj" : "Podgląd"}
                        </button>
                        {index === 0 ? null : (
                          <button
                            type="button"
                            className={adminStyles.rowAction}
                            disabled={saving}
                            onClick={() =>
                              handleSave(
                                version.content,
                                `Przywrócono treść z wersji ${version.version} jako nową wersję.`,
                              )
                            }
                          >
                            Przywróć
                          </button>
                        )}
                      </div>
                      {openVersionId === version.id ? (
                        <pre className={styles.historyPreview}>
                          {version.content}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </>
  );
}
