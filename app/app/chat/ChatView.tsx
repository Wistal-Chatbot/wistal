"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  QuickActionDto,
  QuickActionInputDto,
} from "@/lib/api/quick-actions-types";
import {
  BotIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  MenuIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
} from "../_components/icons";
import { Combobox } from "../_components/Combobox";
import { WorkingStatus } from "./WorkingStatus";
import {
  createSession,
  dtoToUiSession,
  fetchQuickActions,
  fetchQuickActionRows,
  fetchSession,
  fetchSessions,
  messagesToUi,
  redoLatestMessage,
  retryMessage,
  setWebSearch as apiSetWebSearch,
  streamMessage,
  streamQuickAction,
  updateSessionTitle,
  type StreamHandlers,
} from "./chatApi";
import type { UiMessage, UiSession } from "./types";
import styles from "./ChatView.module.css";

type QaForm = {
  key: string;
  title: string;
  input: QuickActionInputDto;
  value: string;
};

type TurnStream = (
  sessionId: string,
  handlers: StreamHandlers,
) => Promise<void>;

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
  const [actions, setActions] = useState<QuickActionDto[]>([]);
  const [fbOpenId, setFbOpenId] = useState<string | null>(null);
  const [fbText, setFbText] = useState("");
  const [fbSent, setFbSent] = useState<Record<string, boolean>>({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const clientSeq = useRef(0);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workingStatusExitTimers = useRef(
    new Set<ReturnType<typeof setTimeout>>(),
  );
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const localRetryStreams = useRef(new Map<string, TurnStream>());

  function nextId(prefix: string) {
    clientSeq.current += 1;
    return `${prefix}-${clientSeq.current}`;
  }

  useEffect(() => {
    const exitTimers = workingStatusExitTimers.current;
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      for (const timer of exitTimers) {
        clearTimeout(timer);
      }
      exitTimers.clear();
    };
  }, []);

  // Focus (and select) the title field as soon as inline editing opens.
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  useEffect(() => {
    const input = chatInputRef.current;
    if (!input) return;

    input.style.height = "0";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [chatInput]);

  // Load the admin-configured quick actions for the composer bar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchQuickActions();
        if (!cancelled) setActions(list);
      } catch {
        // Leave the bar empty on failure; the composer still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    localRetryStreams.current.clear();
    setActiveId(s.id);
    setQaForm(null);
    setEditingTitle(false);
    try {
      const { session, messages: loaded } = await fetchSession(s.id);
      setMessages(messagesToUi(loaded));
      setWebSearch(session.webSearchEnabled);
    } catch {
      setMessages([]);
    }
  }

  function newChat() {
    localRetryStreams.current.clear();
    setQaForm(null);
    setChatInput("");
    setActiveId(null);
    setMessages([]);
    setWebSearch(false);
    setEditingTitle(false);
  }

  function startEditTitle() {
    if (!activeSession) return;
    setTitleDraft(activeSession.title);
    setEditingTitle(true);
  }

  function cancelEditTitle() {
    setEditingTitle(false);
    setTitleDraft("");
  }

  // Rename the active session (optimistic + rollback), then close the editor.
  async function saveTitle() {
    if (!activeId) return;
    const next = titleDraft.trim();
    const previous = activeSession?.title ?? "";
    setEditingTitle(false);
    if (!next || next === previous) return;

    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, title: next } : s)),
    );
    try {
      await updateSessionTitle(activeId, next);
    } catch {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, title: previous } : s)),
      );
    }
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

  // Lazily create the session on the first turn; returns its id or null on failure.
  async function ensureSession(): Promise<string | null> {
    if (activeId) return activeId;
    try {
      const dto = await createSession({ webSearchEnabled: webSearch });
      setSessions((prev) => [dtoToUiSession(dto), ...prev]);
      setActiveId(dto.id);
      setWebSearch(dto.webSearchEnabled);
      return dto.id;
    } catch {
      return null;
    }
  }

  /**
   * Shared turn bookkeeping: appends the user + a pending bot message, seeds the
   * sidebar title, then delegates the streaming to `stream` (a chat message or a
   * quick action). Both endpoints emit the same NDJSON frames.
   */
  async function runTurn(
    userText: string,
    stream: TurnStream,
  ) {
    if (sending) return;
    const sid = await ensureSession();
    if (!sid) return;

    const time = nowTime();
    const userMsg: UiMessage = { id: nextId("user"), role: "user", time, content: userText };
    const botId = nextId("bot");
    const botMsg: UiMessage = {
      id: botId,
      role: "bot",
      time,
      content: "",
      pending: true,
      workingStatus: "Analizuję pytanie…",
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    localRetryStreams.current.set(botId, stream);
    setSending(true);

    // Seed the sidebar title from the first turn (matches backend auto-title).
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sid && s.title === "Nowa rozmowa"
          ? { ...s, title: userText.slice(0, 60) }
          : s,
      ),
    );

    const patchBot = (patch: Partial<UiMessage>) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === botId ? { ...m, ...patch } : m)),
      );

    let workingStatusVisible = true;
    let workingStatusExitTimer: ReturnType<typeof setTimeout> | null = null;

    const finishWorkingStatus = () => {
      if (!workingStatusVisible || workingStatusExitTimer) return;
      patchBot({ workingStatusLeaving: true });
      workingStatusExitTimer = setTimeout(() => {
        workingStatusVisible = false;
        patchBot({ workingStatus: null, workingStatusLeaving: false });
        if (workingStatusExitTimer) {
          workingStatusExitTimers.current.delete(workingStatusExitTimer);
        }
        workingStatusExitTimer = null;
      }, 260);
      workingStatusExitTimers.current.add(workingStatusExitTimer);
    };

    const clearWorkingStatus = () => {
      workingStatusVisible = false;
      if (workingStatusExitTimer) {
        clearTimeout(workingStatusExitTimer);
        workingStatusExitTimers.current.delete(workingStatusExitTimer);
        workingStatusExitTimer = null;
      }
      patchBot({ workingStatus: null, workingStatusLeaving: false });
    };

    try {
      await stream(sid, {
        onStatus: (workingStatus) => {
          workingStatusVisible = true;
          if (workingStatusExitTimer) {
            clearTimeout(workingStatusExitTimer);
            workingStatusExitTimers.current.delete(workingStatusExitTimer);
            workingStatusExitTimer = null;
          }
          patchBot({ workingStatus, workingStatusLeaving: false });
        },
        onDelta: (delta) => {
          finishWorkingStatus();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botId
                ? {
                    ...m,
                    content: m.content + delta,
                  }
                : m,
            ),
          );
        },
        onMeta: (source, metrics) => {
          finishWorkingStatus();
          patchBot({ source, metrics, pending: false });
          localRetryStreams.current.delete(botId);
        },
        onError: (error) => {
          clearWorkingStatus();
          patchBot({
            id: error.messageId ? String(error.messageId) : botId,
            content: error.message,
            source: null,
            pending: false,
            errorCode: error.errorCode,
            retryable: error.retryable,
            isRetried: error.isRetried,
          });
          if (error.messageId !== null) {
            localRetryStreams.current.delete(botId);
          }
        },
      });
    } catch {
      clearWorkingStatus();
      patchBot({
        content: "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
        source: null,
        pending: false,
        errorCode: "CHAT_NETWORK_ERROR",
        retryable: true,
      });
    } finally {
      finishWorkingStatus();
      patchBot({ pending: false });
      setSending(false);
    }
  }

  async function retryFailedMessage(message: UiMessage) {
    if (sending || !activeId || !message.retryable || !message.errorCode) return;

    const originalId = message.id;
    const localRetryStream = localRetryStreams.current.get(originalId);
    setSending(true);
    setMessages((prev) =>
      prev.map((item) =>
        item.id === originalId
          ? {
              ...item,
              content: "",
              errorCode: null,
              retryable: false,
              pending: true,
              workingStatus: "Ponawiam próbę…",
            }
          : item,
      ),
    );

    const patch = (next: Partial<UiMessage>) =>
      setMessages((prev) =>
        prev.map((item) =>
          item.id === originalId || item.id === next.id
            ? { ...item, ...next }
            : item,
        ),
      );

    try {
      const executeRetry: TurnStream = localRetryStream
        ? localRetryStream
        : (sid, handlers) => retryMessage(sid, originalId, handlers);

      await executeRetry(activeId, {
        onStatus: (workingStatus) => patch({ workingStatus }),
        onDelta: (delta) =>
          setMessages((prev) =>
            prev.map((item) =>
              item.id === originalId
                ? {
                    ...item,
                    workingStatus: null,
                    content: item.content + delta,
                  }
                : item,
            ),
          ),
        onMeta: (source, metrics, meta) => {
          localRetryStreams.current.delete(originalId);
          patch({
            id: String(meta.messageId),
            source,
            metrics,
            pending: false,
            workingStatus: null,
          });
        },
        onError: (error) => {
          const persistedRetryFailure = error.messageId !== null;
          if (persistedRetryFailure) {
            localRetryStreams.current.delete(originalId);
          }
          patch({
            id: error.messageId ? String(error.messageId) : originalId,
            content: error.message,
            errorCode: persistedRetryFailure
              ? error.errorCode
              : message.errorCode,
            retryable: persistedRetryFailure
              ? error.retryable
              : message.retryable,
            pending: false,
            workingStatus: null,
          });
        },
      });
    } catch {
      patch({
        content: "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
        errorCode: message.errorCode || "CHAT_NETWORK_ERROR",
        retryable: true,
        pending: false,
        workingStatus: null,
      });
    } finally {
      patch({ pending: false, workingStatus: null });
      setSending(false);
    }
  }

  async function redoLastTurn() {
    if (sending || !activeId) return;

    const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
    if (lastUserIndex < 0) return;

    const botId = nextId("bot");
    const pendingBot: UiMessage = {
      id: botId,
      role: "bot",
      time: nowTime(),
      content: "",
      pending: true,
      workingStatus: "Ponawiam wiadomość…",
    };
    setMessages((prev) => [...prev.slice(0, lastUserIndex + 1), pendingBot]);
    setSending(true);

    const patchBot = (patch: Partial<UiMessage>) =>
      setMessages((prev) =>
        prev.map((message) =>
          message.id === botId ? { ...message, ...patch } : message,
        ),
      );

    try {
      await redoLatestMessage(activeId, {
        onStatus: (workingStatus) => patchBot({ workingStatus }),
        onDelta: (delta) =>
          setMessages((prev) =>
            prev.map((message) =>
              message.id === botId
                ? {
                    ...message,
                    workingStatus: null,
                    content: message.content + delta,
                  }
                : message,
            ),
          ),
        onMeta: (source, metrics, meta) =>
          patchBot({
            id: String(meta.messageId),
            source,
            metrics,
            pending: false,
            workingStatus: null,
          }),
        onError: (error) =>
          patchBot({
            id: error.messageId ? String(error.messageId) : botId,
            content: error.message,
            errorCode: error.errorCode,
            retryable: error.retryable,
            pending: false,
            workingStatus: null,
          }),
      });
    } catch {
      patchBot({
        content: "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
        errorCode: "CHAT_NETWORK_ERROR",
        retryable: false,
        pending: false,
        workingStatus: null,
      });
    } finally {
      patchBot({ pending: false, workingStatus: null });
      setSending(false);
    }
  }

  async function send(text?: string) {
    const value = (text ?? chatInput).trim();
    if (!value || sending) return;
    setChatInput("");
    await runTurn(value, (sid, handlers) => streamMessage(sid, value, handlers));
  }

  // Runs a quick action; the backend resolves the prompt from template + input.
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

  function onQuickAction(action: QuickActionDto) {
    if (action.input) {
      setQaForm({ key: action.key, title: action.name, input: action.input, value: "" });
    } else {
      void runQuickAction(action.key, action.name, null);
    }
  }

  function submitQa() {
    if (!qaForm) return;
    const value = qaForm.value.trim();
    // A row action always needs a selected row; text only when marked required.
    const mustHaveValue =
      qaForm.input.required || qaForm.input.type === "row_from_table";
    if (mustHaveValue && !value) return;
    void runQuickAction(qaForm.key, qaForm.title, value || null);
    setQaForm(null);
  }

  function sendFeedback(id: string) {
    setFbSent((prev) => ({ ...prev, [id]: true }));
    setFbOpenId(null);
    setFbText("");
  }

  async function copyMarkdown(message: UiMessage) {
    if (!message.content) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = message.content;
        textarea.setAttribute("readonly", "");
        textarea.style.left = "-9999px";
        textarea.style.position = "fixed";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopiedMessageId(message.id);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopiedMessageId(null), 1600);
    } catch {
      // Clipboard access can be blocked by the browser; leave the UI unchanged.
    }
  }

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
          {editingTitle ? (
            <div className={styles.titleEdit}>
              <input
                ref={titleInputRef}
                className={styles.titleInput}
                value={titleDraft}
                maxLength={200}
                aria-label="Nazwa rozmowy"
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveTitle();
                  if (e.key === "Escape") cancelEditTitle();
                }}
                onBlur={() => void saveTitle()}
              />
              <button
                type="button"
                className={styles.titleIconBtn}
                aria-label="Zapisz nazwę"
                title="Zapisz"
                // Fire before the input's blur so the click isn't swallowed.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void saveTitle()}
              >
                <CheckIcon size={16} />
              </button>
              <button
                type="button"
                className={styles.titleIconBtn}
                aria-label="Anuluj zmianę nazwy"
                title="Anuluj"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelEditTitle}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className={styles.columnTitle}>{activeTitle}</div>
              {activeSession ? (
                <button
                  type="button"
                  className={styles.titleEditToggle}
                  aria-label="Zmień nazwę rozmowy"
                  title="Zmień nazwę rozmowy"
                  onClick={startEditTitle}
                >
                  <EditIcon size={16} />
                </button>
              ) : null}
            </>
          )}
        </div>

        <div className={styles.messages}>
          <div className={styles.messagesInner}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                Rozpocznij rozmowę — zapytaj o stany magazynowe, faktury lub kontrahentów.
              </div>
            ) : null}

            {messages.map((msg, index) =>
              msg.role === "bot" ? (
                <div className={styles.botRow} key={msg.id}>
                  <div className={styles.botAvatar}>
                    <BotIcon size={20} />
                  </div>
                  <div className={styles.botBody}>
                    <WorkingStatus
                      status={msg.workingStatus ?? null}
                      leaving={msg.workingStatusLeaving ?? false}
                    />
                    {msg.content || !msg.workingStatus ? (
                      <div
                        className={
                          msg.errorCode ? styles.errorBubble : styles.botBubble
                        }
                        role={msg.errorCode ? "alert" : undefined}
                      >
                        {msg.pending && !msg.content ? (
                          <span className={styles.typing}>Generuję odpowiedź…</span>
                        ) : (
                          msg.errorCode ? (
                            <div className={styles.errorContent}>
                              <div className={styles.errorTitle}>
                                Nie udało się przygotować odpowiedzi
                              </div>
                              <div>{msg.content}</div>
                              <div className={styles.errorCode}>
                                Kod: {msg.errorCode}
                              </div>
                              {msg.retryable ? (
                                <button
                                  type="button"
                                  className={styles.retryButton}
                                  disabled={sending}
                                  onClick={() => void retryFailedMessage(msg)}
                                >
                                  Spróbuj ponownie
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <div className={styles.markdown}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          )
                        )}
                      </div>
                    ) : null}

                    {!msg.pending && !msg.errorCode ? (
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
                        <button
                          type="button"
                          className={`${styles.copyMarkdown} ${
                            copiedMessageId === msg.id ? styles.copyMarkdownCopied : ""
                          }`}
                          aria-label={
                            copiedMessageId === msg.id
                              ? "Skopiowano Markdown odpowiedzi"
                              : "Kopiuj Markdown odpowiedzi"
                          }
                          title={
                            copiedMessageId === msg.id
                              ? "Skopiowano"
                              : "Kopiuj Markdown odpowiedzi"
                          }
                          onClick={() => void copyMarkdown(msg)}
                        >
                          {copiedMessageId === msg.id ? (
                            <CheckIcon size={14} />
                          ) : (
                            <CopyIcon size={14} />
                          )}
                        </button>
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
                  <div className={styles.userMeta}>
                    <div className={styles.userTime}>{msg.time}</div>
                    {index === messages.findLastIndex((item) => item.role === "user") ? (
                      <button
                        type="button"
                        className={styles.redoButton}
                        aria-label="Ponów ostatnią wiadomość"
                        title="Ponów wiadomość"
                        disabled={sending}
                        onClick={() => void redoLastTurn()}
                      >
                        <RefreshIcon size={14} />
                      </button>
                    ) : null}
                  </div>
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
                <label className={styles.qaFormLabel}>{qaForm.input.label}</label>
                <div className={styles.qaFormField}>
                  {qaForm.input.type === "row_from_table" ? (
                    <Combobox
                      value={qaForm.value}
                      onChange={(v) =>
                        setQaForm((f) => (f ? { ...f, value: v } : f))
                      }
                      loadOptions={(q) => fetchQuickActionRows(qaForm.key, q)}
                      placeholder={`Szukaj: ${qaForm.input.label}…`}
                    />
                  ) : (
                    <input
                      className={styles.qaFormInput}
                      placeholder={qaForm.input.placeholder ?? ""}
                      value={qaForm.value}
                      onChange={(e) =>
                        setQaForm((f) => (f ? { ...f, value: e.target.value } : f))
                      }
                    />
                  )}
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
              {actions.map((action) => (
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
              <textarea
                ref={chatInputRef}
                className={styles.chatInput}
                placeholder={'Zapytaj np. "Jaki jest stan magazynowy BBC003?"'}
                value={chatInput}
                disabled={sending}
                rows={1}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;

                  e.preventDefault();
                  e.stopPropagation();

                  if (e.shiftKey) {
                    e.currentTarget.setRangeText(
                      "\n",
                      e.currentTarget.selectionStart,
                      e.currentTarget.selectionEnd,
                      "end",
                    );
                    setChatInput(e.currentTarget.value);
                    return;
                  }

                  void send();
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
