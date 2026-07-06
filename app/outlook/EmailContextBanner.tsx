"use client";

import type { EmailContext } from "@/lib/outlook/office";
import { PlusIcon } from "@/app/app/_components/icons";

import styles from "./EmailContextBanner.module.css";

/**
 * Shows the sender + subject of the open message and a one-click prompt
 * suggestion that prefills the composer. Hidden when no message is selected
 * (section 7 of the plan). The suggestion is intentionally simple (order history
 * for the sender) — mapping the sender to an ERP contrahent is a later iteration.
 */
export function EmailContextBanner({
  context,
  onUsePrompt,
  disabled,
}: {
  context: EmailContext | null;
  onUsePrompt: (text: string) => void;
  disabled?: boolean;
}) {
  if (!context) return null;

  const who = context.fromName || context.fromEmail || "klienta";
  const summary = context.subject ? `${who} — ${context.subject}` : who;
  const suggestion = `Sprawdź historię zamówień klienta ${who}`;

  return (
    <div className={styles.banner}>
      <div className={styles.row}>
        <span className={styles.label}>KONTEKST</span>
        <span className={styles.value} title={summary}>
          {summary}
        </span>
      </div>
      <button
        type="button"
        className={styles.suggestion}
        onClick={() => onUsePrompt(suggestion)}
        disabled={disabled}
      >
        <span className={styles.plus}>
          <PlusIcon size={13} />
        </span>
        {suggestion}
      </button>
    </div>
  );
}
