import { HelpIcon } from "./icons";
import styles from "./FieldHelp.module.css";

/**
 * Small "?" help affordance next to a form label. The explanation bubble is
 * revealed purely on `:hover`/`:focus` (no JS state), mirroring the app's popover
 * tokens. Keyboard-reachable via `tabIndex`, announced via `aria-label`.
 */
export function FieldHelp({ text }: { text: string }) {
  return (
    <span className={styles.help} tabIndex={0} aria-label={text}>
      <HelpIcon size={13} />
      <span className={styles.bubble} role="tooltip">
        {text}
      </span>
    </span>
  );
}
