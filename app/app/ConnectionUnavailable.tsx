import styles from "./ConnectionUnavailable.module.css";

export function ConnectionUnavailable() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.status} aria-hidden="true">
          !
        </div>
        <p className={styles.eyebrow}>BRAK POŁĄCZENIA</p>
        <h1>Nie udało się połączyć z systemem</h1>
        <p className={styles.description}>
          Sprawdź połączenie z internetem, a następnie spróbuj ponownie.
        </p>
        <a className={styles.retryButton} href="">
          Spróbuj ponownie
        </a>
      </section>
    </main>
  );
}
