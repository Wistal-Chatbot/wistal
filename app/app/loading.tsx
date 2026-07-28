import { LoadingIndicator } from "./_components/LoadingIndicator";
import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.page}>
      <LoadingIndicator label="Ładowanie widoku…" variant="panel" />
    </div>
  );
}
