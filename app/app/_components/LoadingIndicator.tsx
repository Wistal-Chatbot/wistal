import styles from "./LoadingIndicator.module.css";

type LoadingIndicatorProps = {
  label: string;
  variant?: "inline" | "panel";
};

export function LoadingIndicator({
  label,
  variant = "inline",
}: LoadingIndicatorProps) {
  return (
    <div
      className={
        variant === "panel" ? styles.indicatorPanel : styles.indicatorInline
      }
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{label}</span>
    </div>
  );
}
