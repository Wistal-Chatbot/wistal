"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./LoginPage.module.css";

const ALLOWED_DOMAIN = "@wistal.com.pl";
const CODE_LENGTH = 6;
const INITIAL_COUNTDOWN_SECONDS = 5 * 60;

type Step = "email" | "code";
type SubmitState = "idle" | "submitting";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function errorForStatus(status: number, fallback: string) {
  if (status === 429) {
    return "Za dużo prób. Spróbuj ponownie za kilka minut.";
  }

  return fallback || "Nie udało się wykonać operacji. Spróbuj ponownie.";
}

export function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [countdown, setCountdown] = useState(INITIAL_COUNTDOWN_SECONDS);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const fullCode = code.join("");
  const isSubmitting = state === "submitting";

  useEffect(() => {
    if (step !== "code") {
      return;
    }

    const interval = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [step]);

  async function readError(response: Response) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    return errorForStatus(response.status, body?.error ?? "");
  }

  async function requestOtp(nextEmail = normalizedEmail) {
    const response = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: nextEmail }),
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!normalizedEmail.endsWith(ALLOWED_DOMAIN)) {
      setError("Dostęp tylko dla adresów @wistal.com.pl.");
      return;
    }

    setState("submitting");

    try {
      await requestOtp();
      setStep("code");
      setCode(Array(CODE_LENGTH).fill(""));
      setCountdown(INITIAL_COUNTDOWN_SECONDS);
      setInfo("Kod został wysłany na podany adres e-mail.");
      window.setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nie udało się wysłać kodu.",
      );
    } finally {
      setState("idle");
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!/^\d{6}$/.test(fullCode)) {
      setError("Wpisz 6-cyfrowy kod.");
      return;
    }

    setState("submitting");

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, code: fullCode }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      router.push("/app/chat");
      router.refresh();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Niepoprawny albo wygasły kod.",
      );
    } finally {
      setState("idle");
    }
  }

  function updateCode(index: number, value: string) {
    const nextValue = value.replace(/\D/g, "").slice(-1);
    const nextCode = [...code];
    nextCode[index] = nextValue;
    setCode(nextCode);
    setError("");

    if (nextValue && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleCodeKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleCodePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");

    if (!pasted) {
      return;
    }

    const nextCode = Array(CODE_LENGTH).fill("");
    pasted
      .slice(0, CODE_LENGTH)
      .split("")
      .forEach((digit, index) => {
        nextCode[index] = digit;
      });
    setCode(nextCode);
    setError("");

    const nextFocus = Math.min(pasted.length, CODE_LENGTH) - 1;
    inputRefs.current[Math.max(nextFocus, 0)]?.focus();
  }

  async function resendCode() {
    setError("");
    setInfo("");
    setState("submitting");

    try {
      await requestOtp();
      setCountdown(INITIAL_COUNTDOWN_SECONDS);
      setCode(Array(CODE_LENGTH).fill(""));
      setInfo("Wysłaliśmy nowy kod logowania.");
      window.setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nie udało się ponownie wysłać kodu.",
      );
    } finally {
      setState("idle");
    }
  }

  function changeEmail() {
    setStep("email");
    setCode(Array(CODE_LENGTH).fill(""));
    setError("");
    setInfo("");
  }

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
          <h1>Panel wewnętrzny</h1>
          <p>
            Asystent AI, dane magazynowe wyrobów hutniczych i audyty klientów
            w jednym narzędziu pracy.
          </p>
        </div>
        <p className={styles.footnote}>© 2026 Wistal · Wyroby hutnicze · Świdnica</p>
      </section>

      <section className={styles.formPanel} aria-label="Logowanie">
        <div className={styles.formCard}>
          <p className={styles.formKicker}>LOGOWANIE JEDNORAZOWE</p>
          <h2>Zaloguj się do systemu</h2>

          {step === "email" ? (
            <form className={styles.form} onSubmit={submitEmail}>
              <p className={styles.helpText}>
                Podaj służbowy adres e-mail. Wyślemy jednorazowy kod dostępu.
              </p>
              <label className={styles.label} htmlFor="email">
                Adres e-mail
              </label>
              <input
                autoComplete="email"
                autoFocus
                className={styles.input}
                id="email"
                inputMode="email"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="jan.kowalski@wistal.com.pl"
                type="email"
                value={email}
              />
              <StatusMessage error={error} info={info} />
              <button
                className={styles.primaryButton}
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Wysyłanie kodu..." : "Wyślij kod jednorazowy"}
              </button>
              <p className={styles.domainNote}>
                Dostęp tylko dla domeny @wistal.com.pl
              </p>
            </form>
          ) : (
            <form className={styles.form} onSubmit={submitCode}>
              <p className={styles.helpText}>
                Wpisz 6-cyfrowy kod wysłany na adres{" "}
                <span className={styles.emailValue}>{normalizedEmail}</span>
              </p>

              <fieldset className={styles.codeFieldset} aria-label="Kod OTP">
                {code.map((digit, index) => (
                  <input
                    aria-label={`Cyfra ${index + 1}`}
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    className={styles.codeInput}
                    inputMode="numeric"
                    key={index}
                    maxLength={1}
                    onChange={(event) => updateCode(index, event.target.value)}
                    onKeyDown={(event) => handleCodeKeyDown(index, event)}
                    onPaste={handleCodePaste}
                    pattern="[0-9]*"
                    ref={(node) => {
                      inputRefs.current[index] = node;
                    }}
                    type="text"
                    value={digit}
                  />
                ))}
              </fieldset>

              <div className={styles.codeMeta}>
                {countdown > 0
                  ? `Kod wygasa za ${formatCountdown(countdown)}`
                  : "Kod mógł wygasnąć. Wyślij nowy kod."}
              </div>

              <StatusMessage error={error} info={info} />

              <button
                className={styles.primaryButton}
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Logowanie..." : "Zaloguj się"}
              </button>

              <div className={styles.secondaryActions}>
                <button disabled={isSubmitting} onClick={resendCode} type="button">
                  Wyślij kod ponownie
                </button>
                <button disabled={isSubmitting} onClick={changeEmail} type="button">
                  Zmień adres e-mail
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function StatusMessage({ error, info }: { error: string; info: string }) {
  if (!error && !info) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className={error ? styles.errorMessage : styles.infoMessage}
      role={error ? "alert" : "status"}
    >
      {error || info}
    </p>
  );
}
