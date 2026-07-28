import styles from "./WorkingStatus.module.css";

export function WorkingStatus({
  status,
  leaving,
}: {
  status: string | null;
  leaving: boolean;
}) {
  if (!status) return null;

  return (
    <div
      className={`${styles.wrapper} ${leaving ? styles.leaving : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.panel}>
        <span className={styles.activity} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>{status}</span>
      </div>
    </div>
  );
}
