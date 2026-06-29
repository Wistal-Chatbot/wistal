"use client";

import { useRef, useState } from "react";
import {
  type ChatMessage,
  type ChatSession,
  type MessageBlock,
  type QuickAction,
  type TextSegment,
  buildMockReply,
  chatSessions,
  quickActions,
} from "@/lib/mock-data";
import {
  BotIcon,
  CheckIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
} from "../_components/icons";
import styles from "./ChatView.module.css";

type QaForm = { title: string; label: string; placeholder: string; value: string };

function nowTime() {
  return new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function Segments({ parts }: { parts: TextSegment[] }) {
  return (
    <>
      {parts.map((seg, i) => (
        <span key={i} style={seg.bold ? { fontWeight: 600 } : undefined}>
          {seg.text}
        </span>
      ))}
    </>
  );
}

function MessageBlocks({ blocks }: { blocks: MessageBlock[] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.type === "text" ? (
          <p className={styles.botText} key={i}>
            <Segments parts={block.parts} />
          </p>
        ) : (
          <div className={styles.botList} key={i}>
            {block.bullets.map((b, j) => (
              <div className={styles.bullet} key={j}>
                <span className={styles.bulletDash}>–</span>
                <span>
                  <span className={styles.bulletLabel}>{b.label}</span>
                  {b.rest}
                </span>
              </div>
            ))}
          </div>
        ),
      )}
    </>
  );
}

export function ChatView({
  sessionId,
  initialPrompt = "",
}: {
  sessionId?: string;
  initialPrompt?: string;
}) {
  const startSession =
    chatSessions.find((s) => s.id === sessionId) ?? chatSessions[0];

  const [activeId, setActiveId] = useState<string | null>(startSession?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(startSession?.messages ?? []);
  const [chatInput, setChatInput] = useState(initialPrompt);
  const [search, setSearch] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [qaForm, setQaForm] = useState<QaForm | null>(null);
  const [fbOpenId, setFbOpenId] = useState<string | null>(null);
  const [fbText, setFbText] = useState("");
  const [fbSent, setFbSent] = useState<Record<string, boolean>>({});
  const msgCounter = useRef(0);

  const activeSession = chatSessions.find((s) => s.id === activeId) ?? null;
  const activeTitle = activeSession?.title ?? "Nowa rozmowa";

  const visibleSessions = chatSessions.filter((s) =>
    s.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function selectSession(s: ChatSession) {
    setActiveId(s.id);
    setMessages(s.messages);
    setQaForm(null);
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setChatInput("");
    setQaForm(null);
  }

  function send(text?: string) {
    const value = (text ?? chatInput).trim();
    if (!value) return;
    const time = nowTime();
    const seq = (msgCounter.current += 1);
    const userMsg: ChatMessage = { id: `user-${seq}`, role: "user", time, text: value };
    setMessages((prev) => [...prev, userMsg, buildMockReply(value, time, `bot-${seq}`)]);
    setChatInput("");
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
      send(action.prompt ?? action.name);
    }
  }

  function submitQa() {
    if (!qaForm) return;
    send(`${qaForm.title} — ${qaForm.value.trim() || "(wszyscy)"}`);
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
      <aside className={styles.history}>
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
                <span className={s.tag === "akcja" ? styles.tagAkcja : styles.tagChat}>
                  {s.tag === "akcja" ? "AKCJA AI" : "CHAT"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className={styles.column}>
        <div className={styles.columnHead}>
          <span className={styles.menuIcon}>
            <MenuIcon size={20} />
          </span>
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
                      <MessageBlocks blocks={msg.blocks ?? []} />
                    </div>
                    <div className={styles.botMeta}>
                      <span>Źródło danych:</span>
                      <span className={styles.metaPill}>{msg.source?.tables}</span>
                      <span className={styles.metaMono}>· Wiersze: {msg.source?.rows}</span>
                      <span className={styles.metaMono}>· Czas zapytania: {msg.source?.ms}</span>
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
                  <div className={styles.userBubble}>{msg.text}</div>
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
              {enabledActions.map((action) => (
                <button
                  type="button"
                  key={action.key}
                  className={styles.quickPill}
                  onClick={() => onQuickAction(action)}
                >
                  {action.input ? <span className={styles.quickCaret}>▼</span> : null}
                  {action.name}
                </button>
              ))}
            </div>

            <div className={styles.webToggleRow}>
              <button
                type="button"
                className={webSearch ? styles.webToggleOn : styles.webToggle}
                onClick={() => setWebSearch((v) => !v)}
              >
                <span className={styles.webGlobe}>🌐</span>
                Wyszukiwanie w internecie: {webSearch ? "WŁ" : "WYŁ"}
              </button>
            </div>

            <div className={styles.inputRow}>
              <input
                className={styles.chatInput}
                placeholder={'Zapytaj np. "Jaki jest stan magazynowy BBC003?"'}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
              />
              <button type="button" className={styles.sendButton} onClick={() => send()}>
                <SendIcon size={16} />
                Wyślij
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
