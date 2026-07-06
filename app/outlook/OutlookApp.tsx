"use client";

import { useEffect, useState } from "react";

import {
  readEmailContext,
  registerItemChanged,
  whenOfficeReady,
  type EmailContext,
} from "@/lib/outlook/office";
import { clearStoredToken, getStoredToken } from "@/lib/outlook/auth-client";

import { ChatPane } from "./ChatPane";
import { LoginPane } from "./LoginPane";
import { fetchMe, setUnauthorizedHandler, type PanelUser } from "./outlookApi";
import styles from "./OutlookApp.module.css";

type Phase = "loading" | "login" | "ready";

export function OutlookApp() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<PanelUser | null>(null);
  const [emailContext, setEmailContext] = useState<EmailContext | null>(null);

  // Office.js: read the open message, then refresh whenever a pinned pane
  // switches to another message (Mailbox 1.5 ItemChanged).
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    (async () => {
      await whenOfficeReady();
      if (cancelled) return;
      setEmailContext(readEmailContext());
      unsubscribe = registerItemChanged(() => setEmailContext(readEmailContext()));
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Auth: validate a stored token on start; any later 401 returns us to login.
  // Both branches resolve through a promise so state is only set in callbacks
  // (no synchronous setState in the effect body).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setPhase("login");
    });

    let cancelled = false;
    const token = getStoredToken();
    const validate = token
      ? fetchMe()
      : Promise.reject(new Error("no-stored-token"));

    validate
      .then((validated) => {
        if (cancelled) return;
        setUser(validated);
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("login");
      });

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, []);

  function handleAuthenticated(authenticated: PanelUser) {
    setUser(authenticated);
    setPhase("ready");
  }

  function handleLogout() {
    clearStoredToken();
    setUser(null);
    setPhase("login");
  }

  if (phase === "loading") {
    return (
      <div className={styles.splash}>
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.splashText}>Ładowanie asystenta…</p>
      </div>
    );
  }

  if (phase === "login" || !user) {
    return <LoginPane onAuthenticated={handleAuthenticated} />;
  }

  return (
    <ChatPane user={user} emailContext={emailContext} onLogout={handleLogout} />
  );
}
