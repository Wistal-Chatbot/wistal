"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { QuickActionDto } from "@/lib/api/quick-actions-types";
import type { EmailContext } from "@/lib/outlook/office";
import { BotIcon, LogoutIcon, PlusIcon, SendIcon } from "@/app/app/_components/icons";

import { EmailContextBanner } from "./EmailContextBanner";
import { QuickActionsBar } from "./QuickActionsBar";
import {
  createSession,
  fetchQuickActions,
  streamMessage,
  streamQuickAction,
  UnauthorizedError,
  type PanelUser,
  type StreamHandlers,
  type UiMessage,
} from "./outlookApi";
import styles from "./ChatPane.module.css";

function nowTime() {
  return new Date().toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatPane({
  user,
  emailContext,
  onLogout,
}: {
  user: PanelUser;
  emailContext: EmailContext | null;
  onLogout: () => void;
}) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actions, setActions] = useState<QuickActionDto[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const clientSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function nextId(prefix: string) {
    clientSeq.current += 1;
    return `${prefix}-${clientSeq.current}`;
  }

  // Load the admin-configured quick actions for the composer bar.
  useEffect(() => {
    let cancelled = false;
    fetchQuickActions()
      .then((list) => {
        if (!cancelled) setActions(list);
      })
      .catch(() => {
        // Leave the bar empty on failure; the composer still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the newest message in view as answers stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Lazily create the session on the first turn; returns its id or null.
  async function ensureSession(): Promise<string | null> {
    if (sessionIdRef.current) return sessionIdRef.current;
    try {
      const dto = await createSession();
      sessionIdRef.current = dto.id;
      return dto.id;
    } catch {
      return null;
    }
  }

  /**
   * Shared turn bookkeeping: append the user + a pending bot message, then
   * delegate streaming to `stream` (a chat message or a quick action). Both
   * endpoints emit the same NDJSON frames handled by the shared parser.
   */
  async function runTurn(
    userText: string,
    stream: (sessionId: string, handlers: StreamHandlers) => Promise<void>,
  ) {
    if (sending) return;
    const sid = await ensureSession();
    if (!sid) {
      return;
    }

    const time = nowTime();
    const userMsg: UiMessage = {
      id: nextId("user"),
      role: "user",
      time,
      content: userText,
    };
    const botId = nextId("bot");
    const botMsg: UiMessage = {
      id: botId,
      role: "bot",
      time,
      content: "",
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setSending(true);

    const patchBot = (patch: Partial<UiMessage>) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, ...patch } : m)),
      );

    try {
      await stream(sid, {
        onDelta: (delta) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botId ? { ...m, content: m.content + delta } : m,
            ),
          ),
        onMeta: (source, metrics) => patchBot({ source, metrics, pending: false }),
        onError: (msg) => patchBot({ content: msg, source: null, pending: false }),
      });
    } catch (error) {
      // A 401 already flips the app back to login (via the unauthorized handler);
      // for anything else, surface a generic error in the pending bubble.
      if (!(error instanceof UnauthorizedError)) {
        patchBot({
          content: "Wystąpił błąd. Spróbuj ponownie.",
          source: null,
          pending: false,
        });
      }
    } finally {
      patchBot({ pending: false });
      setSending(false);
    }
  }

  async function send(text?: string) {
    const value = (text ?? chatInput).trim();
    if (!value || sending) return;
    setChatInput("");
    await runTurn(value, (sid, handlers) => streamMessage(sid, value, handlers));
  }

  async function runQuickAction(
    key: string,
    displayName: string,
    inputValue: string | null,
  ) {
    const label = inputValue ? `${displayName}: ${inputValue}` : displayName;
    await runTurn(label, (sid, handlers) =>
      streamQuickAction(key, sid, inputValue, handlers),
    );
  }

  function newChat() {
    if (sending) return;
    sessionIdRef.current = null;
    setMessages([]);
    setChatInput("");
  }

  function usePrompt(text: string) {
    setChatInput(text);
    inputRef.current?.focus();
  }

  return (
    <div className={styles.pane}>
      <header className={styles.header}>
        <span className={styles.headerMark}>
          <BotIcon size={18} />
        </span>
        <div className={styles.headerText}>
          <div className={styles.headerTitle}>Asystent ERP</div>
          <div className={styles.headerUser} title={user.email}>
            {user.email}
          </div>
        </div>
        <button
          type="button"
          className={styles.headerButton}
          onClick={newChat}
          disabled={sending}
          aria-label="Nowa rozmowa"
          title="Nowa rozmowa"
        >
          <PlusIcon size={16} />
        </button>
        <button
          type="button"
          className={styles.headerButton}
          onClick={onLogout}
          aria-label="Wyloguj się"
          title="Wyloguj się"
        >
          <LogoutIcon size={16} />
        </button>
      </header>

      <EmailContextBanner
        context={emailContext}
        onUsePrompt={usePrompt}
        disabled={sending}
      />

      <div className={styles.messages} ref={scrollRef}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Zapytaj o dane ERP</div>
            <p className={styles.emptyText}>
              Historia zamówień, salda faktur, stany magazynowe — bez opuszczania
              Outlooka. Otwórz maila i skorzystaj z podpowiedzi lub Szybkiej akcji.
            </p>
          </div>
        ) : null}

        {messages.map((msg) =>
          msg.role === "bot" ? (
            <div className={styles.botRow} key={msg.id}>
              <div className={styles.botAvatar}>
                <BotIcon size={17} />
              </div>
              <div className={styles.botBody}>
                <div className={styles.botBubble}>
                  {msg.pending && !msg.content ? (
                    <span className={styles.typing}>Generuję odpowiedź…</span>
                  ) : (
                    <div className={styles.markdown}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                {!msg.pending && (msg.source || msg.metrics) ? (
                  <div className={styles.botMeta}>
                    {msg.source ? (
                      <span className={styles.metaPill}>{msg.source.tables}</span>
                    ) : null}
                    {msg.source ? (
                      <span className={styles.metaMono}>· {msg.source.rows}</span>
                    ) : null}
                    {msg.metrics ? (
                      <span className={styles.metaMono}>
                        · {msg.metrics.responseTime}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className={styles.botTime}>{msg.time}</div>
              </div>
            </div>
          ) : (
            <div className={styles.userRow} key={msg.id}>
              <div className={styles.userBubble}>{msg.content}</div>
              <div className={styles.userTime}>{msg.time}</div>
            </div>
          ),
        )}
      </div>

      <div className={styles.composer}>
        <QuickActionsBar
          actions={actions}
          disabled={sending}
          onRun={runQuickAction}
        />
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            className={styles.chatInput}
            placeholder="Zapytaj o dane z ERP…"
            value={chatInput}
            disabled={sending}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void send();
            }}
          />
          <button
            type="button"
            className={styles.sendButton}
            onClick={() => void send()}
            disabled={sending || !chatInput.trim()}
            aria-label="Wyślij"
          >
            <SendIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
