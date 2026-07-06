"use client";

import { useState } from "react";

import type { QuickActionDto } from "@/lib/api/quick-actions-types";
import { Combobox } from "@/app/app/_components/Combobox";
import { PlusIcon } from "@/app/app/_components/icons";

import { fetchQuickActionRows } from "./outlookApi";
import styles from "./QuickActionsBar.module.css";

/**
 * Admin-configured quick actions as chips. Actions with no input run on click;
 * `text` / `row_from_table` actions open a small inline form (a text field or a
 * searchable `Combobox` fed by the rows endpoint) before running. The parent
 * handles the actual run + streaming.
 */
export function QuickActionsBar({
  actions,
  disabled,
  onRun,
}: {
  actions: QuickActionDto[];
  disabled?: boolean;
  onRun: (key: string, displayName: string, value: string | null) => void;
}) {
  const [active, setActive] = useState<QuickActionDto | null>(null);
  const [value, setValue] = useState("");

  if (actions.length === 0) return null;

  function pick(action: QuickActionDto) {
    if (action.input) {
      setActive(action);
      setValue("");
    } else {
      onRun(action.key, action.name, null);
    }
  }

  function submit() {
    if (!active) return;
    const trimmed = value.trim();
    // A row action always needs a selected row; text only when marked required.
    const mustHaveValue =
      active.input?.required || active.input?.type === "row_from_table";
    if (mustHaveValue && !trimmed) return;
    onRun(active.key, active.name, trimmed || null);
    setActive(null);
    setValue("");
  }

  return (
    <div className={styles.wrap}>
      {active?.input ? (
        <div className={styles.form}>
          <div className={styles.formHead}>
            <span className={styles.formIcon}>
              <PlusIcon size={14} />
            </span>
            <span className={styles.formTitle}>{active.name}</span>
          </div>
          <label className={styles.formLabel}>{active.input.label}</label>
          <div className={styles.formField}>
            {active.input.type === "row_from_table" ? (
              <Combobox
                value={value}
                onChange={(next) => setValue(next)}
                loadOptions={(query) => fetchQuickActionRows(active.key, query)}
                placeholder={`Szukaj: ${active.input.label}…`}
              />
            ) : (
              <input
                className={styles.formInput}
                placeholder={active.input.placeholder ?? ""}
                value={value}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
            )}
          </div>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                setActive(null);
                setValue("");
              }}
            >
              Anuluj
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={submit}
              disabled={disabled}
            >
              Wykonaj
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.chips}>
        <span className={styles.chipsLabel}>SZYBKIE AKCJE</span>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={styles.chip}
            onClick={() => pick(action)}
            disabled={disabled}
            title={action.description ?? undefined}
          >
            {action.input ? <span className={styles.caret}>▼</span> : null}
            {action.name}
          </button>
        ))}
      </div>
    </div>
  );
}
