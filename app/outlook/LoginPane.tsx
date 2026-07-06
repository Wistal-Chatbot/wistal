"use client";

import Image from "next/image";
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { requestOtp, verifyOtp, type PanelUser } from "./outlookApi";
import styles from "./LoginPane.module.css";

const CODE_LENGTH = 6;
const INITIAL_COUNTDOWN_SECONDS = 5 * 60;

type Step = "email" | "code";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function LoginPane({
  onAuthenticated,
}: {
  onAuthenticated: (user: PanelUser) => void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [countdown, setCountdown] = useState(INITIAL_COUNTDOWN_SECONDS);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const fullCode = code.join("");

  useEffect(() => {
    if (step !== "code") return;
    const interval = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [step]);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      await requestOtp(normalizedEmail);
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
      setSubmitting(false);
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
    setSubmitting(true);
    try {
      const user = await verifyOtp(normalizedEmail, fullCode);
      onAuthenticated(user);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Niepoprawny albo wygasły kod.",
      );
    } finally {
      setSubmitting(false);
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

  function handleCodeKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleCodePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
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
    setSubmitting(true);
    try {
      await requestOtp(normalizedEmail);
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
      setSubmitting(false);
    }
  }

  function changeEmail() {
    setStep("email");
    setCode(Array(CODE_LENGTH).fill(""));
    setError("");
    setInfo("");
  }

  return (
    <div className={styles.pane}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Image
            src="/assets/wistal-logo.png"
            alt="Wistal"
            width={112}
            height={22}
            priority
            unoptimized
          />
        </div>
        <p className={styles.kicker}>ASYSTENT ERP · OUTLOOK</p>

        {step === "email" ? (
          <form className={styles.form} onSubmit={submitEmail}>
            <h1 className={styles.title}>Zaloguj się</h1>
            <p className={styles.help}>
              Podaj służbowy adres e-mail. Wyślemy jednorazowy kod dostępu.
            </p>
            <label className={styles.label} htmlFor="outlook-email">
              Adres e-mail
            </label>
            <input
              id="outlook-email"
              className={styles.input}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="jan.kowalski@wistal.com.pl"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
            />
            <StatusMessage error={error} info={info} />
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Wysyłanie…" : "Wyślij kod jednorazowy"}
            </button>
            <p className={styles.domainNote}>
              Dostęp tylko dla domeny @wistal.com.pl
            </p>
          </form>
        ) : (
          <form className={styles.form} onSubmit={submitCode}>
            <h1 className={styles.title}>Wpisz kod</h1>
            <p className={styles.help}>
              6-cyfrowy kod wysłany na{" "}
              <span className={styles.emailValue}>{normalizedEmail}</span>
            </p>

            <fieldset className={styles.codeFieldset} aria-label="Kod OTP">
              {code.map((digit, index) => (
                <input
                  key={index}
                  aria-label={`Cyfra ${index + 1}`}
                  className={styles.codeInput}
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  pattern="[0-9]*"
                  type="text"
                  value={digit}
                  onChange={(event) => updateCode(index, event.target.value)}
                  onKeyDown={(event) => handleCodeKeyDown(index, event)}
                  onPaste={handleCodePaste}
                  ref={(node) => {
                    inputRefs.current[index] = node;
                  }}
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
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Logowanie…" : "Zaloguj się"}
            </button>

            <div className={styles.secondaryActions}>
              <button type="button" disabled={submitting} onClick={resendCode}>
                Wyślij ponownie
              </button>
              <button type="button" disabled={submitting} onClick={changeEmail}>
                Zmień e-mail
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function StatusMessage({ error, info }: { error: string; info: string }) {
  if (!error && !info) return null;
  return (
    <p
      aria-live="polite"
      role={error ? "alert" : "status"}
      className={error ? styles.errorMessage : styles.infoMessage}
    >
      {error || info}
    </p>
  );
}
