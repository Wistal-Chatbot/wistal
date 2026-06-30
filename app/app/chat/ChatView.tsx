"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { type QuickAction, quickActions } from "@/lib/mock-data";
import {
  BotIcon,
  CheckIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
} from "../_components/icons";
import {
  createSession,
  dtoToUiSession,
  fetchSession,
  fetchSessions,
  messagesToUi,
  setWebSearch as apiSetWebSearch,
  streamMessage,
} from "./chatApi";
import type { UiMessage, UiSession } from "./types";
import styles from "./ChatView.module.css";

type QaForm = { title: string; label: string; placeholder: string; value: string };

function nowTime() {
  return new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

export function ChatView({
  sessionId,
  initialPrompt = "",
}: {
  sessionId?: string;
  initialPrompt?: string;
}) {
  const [sessions, setSessions] = useState<UiSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [chatInput, setChatInput] = useState(initialPrompt);
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [webSearch, setWebSearch] = useState(false);
  const [sending, setSending] = useState(false);
  const [qaForm, setQaForm] = useState<QaForm | null>(null);
  const [fbOpenId, setFbOpenId] = useState<string | null>(null);
  const [fbText, setFbText] = useState("");
  const [fbSent, setFbSent] = useState<Record<string, boolean>>({});
  const clientSeq = useRef(0);

  function nextId(prefix: string) {
    clientSeq.current += 1;
    return `${prefix}-${clientSeq.current}`;
  }

  // Load the session list on mount, then open the requested session (if any).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchSessions();
        if (cancelled) return;
        setSessions(list.map(dtoToUiSession));

        if (!sessionId) return;
        const requested = list.find((s) => s.id === sessionId);
        if (!requested) return;

        const detail = await fetchSession(requested.id);
        if (cancelled) return;
        setActiveId(detail.session.id);
        setMessages(messagesToUi(detail.messages));
        setWebSearch(detail.session.webSearchEnabled);
      } catch {
        // Leave the list empty on failure; the empty-state copy still applies.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const activeTitle = activeSession?.title ?? "Nowa rozmowa";

  const visibleSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  async function selectSession(s: UiSession) {
    setActiveId(s.id);
    setQaForm(null);
    try {
      const { session, messages: loaded } = await fetchSession(s.id);
      setMessages(messagesToUi(loaded));
      setWebSearch(session.webSearchEnabled);
    } catch {
      setMessages([]);
    }
  }

  function newChat() {
    setQaForm(null);
    setChatInput("");
    setActiveId(null);
    setMessages([]);
    setWebSearch(false);
  }

  // Persist the web-search toggle on the active session (optimistic + rollback).
  async function toggleWebSearch() {
    const next = !webSearch;
    setWebSearch(next);
    if (!activeId) return;
    try {
      await apiSetWebSearch(activeId, next);
    } catch {
      setWebSearch(!next);
    }
  }

  async function send(text?: string) {
    const value = (text ?? chatInput).trim();
    if (!value || sending) return;

    // Lazily create the session on the first message.
    let sid = activeId;
    if (!sid) {
      try {
        const dto = await createSession({ webSearchEnabled: webSearch });
        setSessions((prev) => [dtoToUiSession(dto), ...prev]);
        setActiveId(dto.id);
        setWebSearch(dto.webSearchEnabled);
        sid = dto.id;
      } catch {
        return;
      }
    }

    const time = nowTime();
    const userMsg: UiMessage = { id: nextId("user"), role: "user", time, content: value };
    const botId = nextId("bot");
    const botMsg: UiMessage = { id: botId, role: "bot", time, content: "", pending: true };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setChatInput("");
    setSending(true);

    // Seed the sidebar title from the first question (matches backend auto-title).
    const sessionId = sid;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId && s.title === "Nowa rozmowa"
          ? { ...s, title: value.slice(0, 60) }
          : s,
      ),
    );

    const patchBot = (patch: Partial<UiMessage>) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, ...patch } : m)),
      );

    try {
      await streamMessage(sessionId, value, {
        onDelta: (delta) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botId ? { ...m, content: m.content + delta } : m,
            ),
          ),
        onMeta: (source, metrics) => patchBot({ source, metrics, pending: false }),
        onError: (msg) => patchBot({ content: msg, source: null, pending: false }),
      });
    } finally {
      patchBot({ pending: false });
      setSending(false);
    }
  }

  function onQuickAction(action: QuickAction) {
    if (action.input) {
      setQaForm({
        title: action.name,
        label: action.input.label,
        placeholder: action.input.placeholder,
        value: "",
      });
    } else {
      void send(action.prompt ?? action.name);
    }
  }

  function submitQa() {
    if (!qaForm) return;
    void send(`${qaForm.title} — ${qaForm.value.trim() || "(wszyscy)"}`);
    setQaForm(null);
  }

  function sendFeedback(id: string) {
    setFbSent((prev) => ({ ...prev, [id]: true }));
    setFbOpenId(null);
    setFbText("");
  }

  const enabledActions = quickActions.filter((a) => a.enabled);

  return (
    <div className={styles.chat}>
      <aside
        id="chat-history-panel"
        className={`${styles.history} ${historyOpen ? styles.historyOpen : styles.historyClosed}`}
      >
        <div className={styles.historyHead}>
          <button type="button" className={styles.newChat} onClick={newChat}>
            <span className={styles.newChatPlus}>+</span>
            Nowa rozmowa
          </button>
          <div className={styles.searchField}>
            <span className={styles.searchIcon}>
              <SearchIcon size={15} stroke="#9aa3b1" />
            </span>
            <input
              className={styles.searchInput}
              placeholder="Szukaj rozmów…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.historyList}>
          {visibleSessions.map((s) => (
            <button
              type="button"
              key={s.id}
              className={s.id === activeId ? styles.sessionItemActive : styles.sessionItem}
              onClick={() => selectSession(s)}
            >
              <div className={styles.sessionTitle}>{s.title}</div>
              <div className={styles.sessionMeta}>
                <span className={styles.sessionTime}>{s.time}</span>
                <span className={styles.tagChat}>CHAT</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className={styles.column}>
        <div className={styles.columnHead}>
          <button
            type="button"
            className={styles.historyToggle}
            aria-controls="chat-history-panel"
            aria-expanded={historyOpen}
            aria-label={historyOpen ? "Ukryj historię rozmów" : "Pokaż historię rozmów"}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <MenuIcon size={18} />
          </button>
          <div className={styles.columnTitle}>{activeTitle}</div>
        </div>

        <div className={styles.messages}>
          <div className={styles.messagesInner}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                Rozpocznij rozmowę — zapytaj o stany magazynowe, faktury lub kontrahentów.
              </div>
            ) : null}

            {messages.map((msg) =>
              msg.role === "bot" ? (
                <div className={styles.botRow} key={msg.id}>
                  <div className={styles.botAvatar}>
                    <BotIcon size={20} />
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

                    {!msg.pending ? (
                      <div className={styles.botMeta}>
                        {msg.source ? (
                          <>
                            <span>Źródło danych:</span>
                            <span className={styles.metaPill}>{msg.source.tables}</span>
                            <span className={styles.metaMono}>· Wiersze: {msg.source.rows}</span>
                          </>
                        ) : null}
                        {msg.metrics ? (
                          <>
                            <span className={styles.metaMono}>
                              · Czas odpowiedzi: {msg.metrics.responseTime}
                            </span>
                            <span className={styles.metaMono}>
                              · Tokeny: {msg.metrics.tokens}
                            </span>
                          </>
                        ) : null}
                        <div className={styles.spacer} />
                        {fbSent[msg.id] ? (
                          <span className={styles.fbDone}>
                            <CheckIcon size={13} />
                            Dziękujemy za feedback
                          </span>
                        ) : fbOpenId === msg.id ? null : (
                          <button
                            type="button"
                            className={styles.fbOpen}
                            onClick={() => {
                              setFbOpenId(msg.id);
                              setFbText("");
                            }}
                          >
                            Dodaj feedback
                          </button>
                        )}
                      </div>
                    ) : null}

                    {fbOpenId === msg.id ? (
                      <div className={styles.fbBox}>
                        <div className={styles.fbBoxLabel}>Co poprawić w tej odpowiedzi?</div>
                        <textarea
                          className={styles.fbTextarea}
                          placeholder="Twój komentarz…"
                          value={fbText}
                          onChange={(e) => setFbText(e.target.value)}
                        />
                        <div className={styles.fbActions}>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => {
                              setFbOpenId(null);
                              setFbText("");
                            }}
                          >
                            Anuluj
                          </button>
                          <button
                            type="button"
                            className={styles.btnPrimarySm}
                            onClick={() => sendFeedback(msg.id)}
                          >
                            Wyślij feedback
                          </button>
                        </div>
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
        </div>

        <div className={styles.composer}>
          <div className={styles.composerInner}>
            {qaForm ? (
              <div className={styles.qaForm}>
                <div className={styles.qaFormHead}>
                  <span className={styles.qaFormIcon}>
                    <PlusIcon size={16} />
                  </span>
                  <div className={styles.qaFormTitle}>{qaForm.title}</div>
                </div>
                <label className={styles.qaFormLabel}>{qaForm.label}</label>
                <div className={styles.qaFormField}>
                  <input
                    className={styles.qaFormInput}
                    placeholder={qaForm.placeholder}
                    value={qaForm.value}
                    onChange={(e) =>
                      setQaForm((f) => (f ? { ...f, value: e.target.value } : f))
                    }
                  />
                  <span className={styles.qaFormCaret}>▼</span>
                </div>
                <div className={styles.qaFormActions}>
                  <button type="button" className={styles.btnGhost} onClick={() => setQaForm(null)}>
                    Anuluj
                  </button>
                  <button type="button" className={styles.btnPrimary} onClick={submitQa}>
                    Wykonaj
                  </button>
                </div>
              </div>
            ) : null}

            <div className={styles.quickBar}>
              <span className={styles.quickLabel}>SZYBKIE AKCJE</span>
              <button
                type="button"
                className={webSearch ? styles.webToggleOn : styles.webToggle}
                onClick={toggleWebSearch}
              >
                <span className={styles.webGlobe}>🌐</span>
                Wyszukiwanie w internecie: {webSearch ? "WŁ" : "WYŁ"}
              </button>
              {enabledActions.map((action) => (
                <button
                  type="button"
                  key={action.key}
                  className={styles.quickPill}
                  onClick={() => onQuickAction(action)}
                  disabled={sending}
                >
                  {action.input ? <span className={styles.quickCaret}>▼</span> : null}
                  {action.name}
                </button>
              ))}
            </div>

            <div className={styles.inputRow}>
              <input
                className={styles.chatInput}
                placeholder={'Zapytaj np. "Jaki jest stan magazynowy BBC003?"'}
                value={chatInput}
                disabled={sending}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send();
                }}
              />
              <button
                type="button"
                className={styles.sendButton}
                onClick={() => void send()}
                disabled={sending}
              >
                <SendIcon size={16} />
                {sending ? "Wysyłanie…" : "Wyślij"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
