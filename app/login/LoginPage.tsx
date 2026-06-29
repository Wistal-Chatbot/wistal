import Image from "next/image";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="Wistal ERP AI">
        <div className={styles.brandBackdrop} />
        <Image
          className={styles.logo}
          src="/assets/wistal-logo.png"
          alt="Wistal"
          width={180}
          height={62}
          priority
        />
        <div className={styles.brandCopy}>
          <p className={styles.kicker}>PANEL WEWNĘTRZNY</p>
          <h1>Wistal ERP AI</h1>
          <p>
            Asystent AI, dane ERP i raporty analityczne w jednym narzędziu
            pracy.
          </p>
        </div>
        <p className={styles.footnote}>© 2026 Wistal · Wyroby hutnicze</p>
      </section>

      <section className={styles.formPanel} aria-label="Logowanie">
        <div className={styles.formCard}>
          <p className={styles.formKicker}>LOGOWANIE JEDNORAZOWE</p>
          <h2>Zaloguj się do systemu</h2>
          <p className={styles.helpText}>
            Pusta makieta ekranu logowania. Docelowo: email służbowy, kod OTP i
            walidacja domeny @wistal.com.pl.
          </p>
          <label className={styles.label} htmlFor="email">
            Adres e-mail
          </label>
          <input
            className={styles.input}
            id="email"
            placeholder="jan.kowalski@wistal.com.pl"
            type="email"
          />
          <button className={styles.primaryButton} type="button">
            Wyślij kod logowania
          </button>
          <p className={styles.domainNote}>Dostęp tylko dla domeny @wistal.com.pl</p>
        </div>
      </section>
    </main>
  );
}
