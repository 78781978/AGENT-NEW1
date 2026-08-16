"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";

const tools = [
  { name: "Kalkulator", emoji: "🧮", key: "calculator" },
  { name: "Data i czas", emoji: "CZ", key: "currentDateTime" },
  { name: "Google Search", emoji: "WEB", key: "webSearch" },
  { name: "Czytanie stron", emoji: "📄", key: "readWebPage" },
  { name: "Generowanie obrazów", emoji: "🎨", key: "generateImage" },
  { name: "Analiza obrazów", emoji: "IMG", key: "vision" },
];

type ChatMode = "casual" | "expert" | "creative";
type ModelChoice = "flash" | "pro";

const modes: Array<{
  id: ChatMode;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "casual",
    label: "Casual",
    icon: "💬",
    description: "krótko, prosto i po ludzku",
  },
  {
    id: "expert",
    label: "Ekspert",
    icon: "🎓",
    description: "analitycznie, formalnie i z rekomendacją",
  },
  {
    id: "creative",
    label: "Kreatywny",
    icon: "🎨",
    description: "nieszablonowo, z analogiami i inspiracją",
  },
];

const models: Array<{
  id: ModelChoice;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "flash",
    label: "Flash",
    icon: "⚡",
    description: "szybki model do codziennych pytań",
  },
  {
    id: "pro",
    label: "Pro",
    icon: "🧠",
    description: "zaawansowany model do złożonych analiz",
  },
];

const scenarios = [
  "Znajdź w Google co robi firma Syntelligence i wygeneruj dla nich logo",
  "Przeczytaj stronę apple.com i opisz ich aktualną ofertę iPhone",
  "Ile to 23% VAT z 8500 PLN? Podaj kwotę brutto i netto",
  "Jakie są najnowsze wiadomości o AI? Wygeneruj grafikę do posta o tym",
  "Wyszukaj w Google 'best coffee shops Kraków' i streszcz wyniki",
];

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: {
    image?: string;
    result?: unknown;
    content?: string;
    summary?: string;
    locale?: string;
    provider?: string;
    model?: string;
    [key: string]: unknown;
  };
  errorText?: string;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return { error: text };
  }
}

function toolName(part: ToolPart) {
  return part.type.replace("tool-", "");
}

function toolEmoji(name: string) {
  return tools.find((item) => item.key === name)?.emoji ?? "🔧";
}

function toolSummary(part: ToolPart) {
  const output = part.output;

  if (part.errorText) {
    return part.errorText;
  }

  if (!output) {
    return part.state === "input-available" ? "narzędzie czeka na wynik" : "w trakcie";
  }

  if (typeof output.result !== "undefined") {
    return `wynik: ${String(output.result)}`;
  }

  if (output.locale) {
    return String(output.locale);
  }

  if (output.image) {
    return `obraz: ${output.provider ?? "generator"} / ${output.model ?? "model"}`;
  }

  if (output.summary) {
    return String(output.summary).slice(0, 180);
  }

  if (output.content) {
    return String(output.content).slice(0, 160);
  }

  return "narzędzie zakończone";
}

function getToolParts(message: UIMessage) {
  return message.parts.filter((part) => part.type.startsWith("tool-")) as ToolPart[];
}

function renderInline(text: string) {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  function renderBold(value: string, keyPrefix: string) {
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const boldParts: ReactNode[] = [];
    let boldLastIndex = 0;
    let boldMatch: RegExpExecArray | null;

    while ((boldMatch = boldRegex.exec(value)) !== null) {
      if (boldMatch.index > boldLastIndex) {
        boldParts.push(
          <Fragment key={`${keyPrefix}-plain-${boldLastIndex}`}>
            {value.slice(boldLastIndex, boldMatch.index)}
          </Fragment>,
        );
      }

      boldParts.push(<strong key={`${keyPrefix}-bold-${boldMatch.index}`}>{boldMatch[1]}</strong>);
      boldLastIndex = boldMatch.index + boldMatch[0].length;
    }

    if (boldLastIndex < value.length) {
      boldParts.push(
        <Fragment key={`${keyPrefix}-plain-${boldLastIndex}`}>{value.slice(boldLastIndex)}</Fragment>,
      );
    }

    return boldParts.length ? boldParts : value;
  }

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <Fragment key={`text-${lastIndex}`}>
          {renderBold(text.slice(lastIndex, match.index), `text-${lastIndex}`)}
        </Fragment>,
      );
    }

    parts.push(
      <a href={match[2]} key={`${match[2]}-${match.index}`} target="_blank" rel="noreferrer">
        {match[1]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <Fragment key={`text-${lastIndex}`}>{renderBold(text.slice(lastIndex), `text-${lastIndex}`)}</Fragment>,
    );
  }

  return parts.length ? parts : renderBold(text, "full");
}

function renderText(text: string) {
  return text.split("\n").map((line, index, lines) => (
    <Fragment key={`${line}-${index}`}>
      {renderInline(line)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function splitSourceLine(text: string) {
  const lines = text.split("\n");
  const sourceIndex = lines.findIndex((line) =>
    /^📎\s*Źródł[oa]:/i.test(line.trim()),
  );

  if (sourceIndex === -1) {
    return { body: text, source: "" };
  }

  return {
    body: lines.filter((_, index) => index !== sourceIndex).join("\n").trim(),
    source: lines[sourceIndex].trim().replace(/^📎\s*/, ""),
  };
}

async function downloadImage(src: string) {
  const response = await fetch(src);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = "agent-generated-image.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function shouldShowToolPart(part: ToolPart) {
  return toolName(part) !== "calculator";
}

function extractProfileDetails(text: string) {
  const clean = (value?: string) => value?.trim().replace(/[.!?]+$/, "");
  const name = clean(text.match(/(?:mam na imi[eę]|nazywam si[eę])\s+([a-ząćęłńóśźż-]+)/i)?.[1]);
  const likes = clean(
    text.match(/\blubi[eę]\s+(.{2,100}?)(?=\s+(?:i\s+)?mieszkam\b|[.;!?]|$)/i)?.[1],
  );
  const city = clean(
    text.match(/\bmieszkam w\s+([a-ząćęłńóśźż -]{2,60}?)(?=[,.;!?]|$)/i)?.[1],
  );

  return {
    name,
    preferences: {
      ...(likes ? { "co_lubię": likes } : {}),
      ...(city ? { miasto: city } : {}),
    },
  };
}

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [downloadedImage, setDownloadedImage] = useState("");
  const [mode, setMode] = useState<ChatMode>("expert");
  const [model, setModel] = useState<ModelChoice>("flash");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [persistenceError, setPersistenceError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const startRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        prepareSendMessagesRequest({ messages, body }) {
          return {
            body: {
              ...body,
              messages,
              mode,
              model,
            },
          };
        },
      }),
    [mode, model],
  );

  const { messages, sendMessage, status, stop, error, clearError, setMessages } =
    useChat({
      transport,
      onFinish({ message }) {
        if (startRef.current) {
          setDurations((current) => ({
            ...current,
            [message.id]: (performance.now() - startRef.current!) / 1000,
          }));
        }
        const activeConversationId = conversationIdRef.current;
        const content = messageText(message);
        if (activeConversationId && content) {
          void saveMessage(activeConversationId, "assistant", content);
        }
      },
    });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        const savedId = localStorage.getItem("vie_agent_conversation_id");
        if (!savedId) return;

        const response = await fetch(`/api/conversations?id=${encodeURIComponent(savedId)}`);
        const data = await readJsonResponse(response);
        if (!response.ok) throw new Error(String(data.error || "Nie udało się wczytać historii agenta."));
        if (!active) return;

        if (data.conversation) {
          const loadedMessages = (data.messages ?? []) as StoredMessage[];
          setConversationId(String(data.conversation.id));
          conversationIdRef.current = String(data.conversation.id);
          setMessages(
            loadedMessages.map((message) => ({
              id: message.id,
              role: message.role,
              parts: [{ type: "text", text: message.content }],
            })),
          );
        }
      } catch (historyError) {
        if (active) {
          setPersistenceError(
            historyError instanceof Error
              ? historyError.message
              : "Nie udało się wczytać historii agenta.",
          );
        }
      } finally {
        if (active) setHistoryLoading(false);
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [setMessages]);

  useEffect(() => {
    if (!pastedFile) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(pastedFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [pastedFile]);

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const image = Array.from(event.clipboardData.files).find((file) =>
      file.type.startsWith("image/"),
    );

    if (image) {
      setPastedFile(image);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();

    if ((!trimmed && !pastedFile) || isLoading) {
      return;
    }

    startRef.current = performance.now();
    clearError();
    setPersistenceError("");
    setInput("");

    if (trimmed) {
      const profile = extractProfileDetails(trimmed);
      if (profile.name || Object.keys(profile.preferences).length) {
        const profileResponse = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        });
        const profileData = await readJsonResponse(profileResponse);
        if (!profileResponse.ok) {
          setPersistenceError(
            `Preferencje: ${String(profileData.error || "nie udało się zapisać profilu.")}`,
          );
        }
      }
    }

    const activeConversationId = conversationId ?? (await createConversation(trimmed || "Analiza obrazu"));
    if (trimmed) {
      await saveMessage(activeConversationId, "user", trimmed);
    }

    if (pastedFile) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(pastedFile);
      setPastedFile(null);
      await sendMessage({
        text: trimmed || "Opisz ten screenshot i wskaż najważniejsze elementy.",
        files: dataTransfer.files,
      });
      return;
    }

    await sendMessage({ text: trimmed });
  }

  function startScenario(scenario: string) {
    clearError();
    setInput(scenario);
  }

  async function createConversation(title = "Agent AI") {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Agent AI - ${title}`.slice(0, 50) }),
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(String(data.error || "Nie udało się utworzyć rozmowy agenta."));

    const id = String(data.conversation.id);
    setConversationId(id);
    conversationIdRef.current = id;
    localStorage.setItem("vie_agent_conversation_id", id);
    return id;
  }

  async function saveMessage(id: string, role: "user" | "assistant", content: string) {
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, role, content }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(String(data.error || "Nie udało się zapisać wiadomości."));
      setPersistenceError("");
    } catch (saveError) {
      setPersistenceError(
        saveError instanceof Error ? saveError.message : "Nie udało się zapisać wiadomości.",
      );
    }
  }

  async function resetConversation() {
    clearError();
    setMessages([]);
    setDurations({});
    setPastedFile(null);
    setPersistenceError("");
    await createConversation();
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Agent AI Pełna moc">
        <AppNav active="/agent" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 3 · Warsztat 4</p>
            <h1>🤖 Agent AI - Pełna moc</h1>
            <p className="subtitle">
              {tools.length} narzędzi • autonomiczne decyzje. Agent sam dobiera
              wyszukiwanie, czytanie stron, kalkulator, datę, analizę obrazu i
              generowanie grafik.
            </p>
            <div className="sample-questions" aria-label="Scenariusze">
              {scenarios.map((scenario) => (
                <button
                  key={scenario}
                  type="button"
                  onClick={() => startScenario(scenario)}
                  disabled={isLoading}
                >
                  {scenario}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="agent-layout">
          <aside className="tools-panel" aria-label="Moje narzędzia">
            <h2>Moje narzędzia</h2>
            {tools.map((item) => (
              <article key={item.key}>
                <span>{item.emoji}</span>
                <p>{item.name}</p>
                <strong>aktywny</strong>
              </article>
            ))}
          </aside>

          <section className="agent-chat">
            <div className="messages" aria-live="polite">
              {historyLoading && (
                <div className="empty-state" role="status">
                  <p>Wczytuję ostatnią rozmowę Agenta AI...</p>
                </div>
              )}

              {messages.length === 0 && (
                <div className="empty-state">
                  <p>
                    Wybierz scenariusz albo wpisz własne zadanie. Możesz też
                    wkleić screenshot do pola wiadomości przez Ctrl+V.
                  </p>
                </div>
              )}

              {messages.map((message) => {
                const toolParts = getToolParts(message);
                const visibleToolParts = toolParts.filter(shouldShowToolPart);
                const duration = durations[message.id];
                const { body, source } = splitSourceLine(messageText(message));

                return (
                  <article
                    className={`message ${message.role}`}
                    key={message.id}
                    aria-label={message.role === "user" ? "Użytkownik" : "Agent AI"}
                  >
                    <div className="bubble search-bubble">{renderText(body)}</div>
                    {source ? <div className="message-source">{source}</div> : null}

                    {message.role === "assistant" && visibleToolParts.length > 0 && (
                      <div className="tool-timeline">
                        <strong>🤖 Agent wykonuje zadanie...</strong>
                        {visibleToolParts.map((part, index) => {
                          const name = toolName(part);
                          const image = part.output?.image;

                          return (
                            <div className="tool-step" key={`${part.type}-${index}`}>
                              <span>{index + 1}</span>
                              <div>
                                <h3>
                                  {toolEmoji(name)} {name}
                                </h3>
                                <p>{toolSummary(part)}</p>
                                {image && (
                                  <div className="tool-image">
                                    <img src={image} alt="Obraz wygenerowany przez agenta" />
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await downloadImage(image);
                                        setDownloadedImage(image);
                                        window.setTimeout(() => setDownloadedImage(""), 2500);
                                      }}
                                    >
                                      {downloadedImage === image ? "✅ Pobrano" : "💾 Pobierz"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {message.role === "assistant" && (
                      <div className="tool-counter">
                        Użyto {toolParts.length} narzędzi
                        {duration ? ` | ${duration.toFixed(1)}s` : ""}
                        {` | Tryb: ${modes.find((item) => item.id === mode)?.label ?? mode}`}
                        {` | Model: ${models.find((item) => item.id === model)?.label ?? model}`}
                      </div>
                    )}
                  </article>
                );
              })}

              {isLoading && (
                <article className="message assistant">
                  <div className="bubble thinking">Agent dobiera narzędzia...</div>
                </article>
              )}

              <div ref={bottomRef} />
            </div>

            {error && (
              <div className="error-box">
                <p>Coś poszło nie tak: {error.message}</p>
                <button type="button" onClick={clearError}>
                  Wyczyść błąd
                </button>
              </div>
            )}

            {previewUrl && (
              <div className="paste-preview">
                <img src={previewUrl} alt="Wklejony screenshot" />
                <button type="button" onClick={() => setPastedFile(null)}>
                  Usuń screenshot
                </button>
              </div>
            )}

            {persistenceError && (
              <div className="error-box">
                <p>Historia agenta: {persistenceError}</p>
                <button type="button" onClick={() => setPersistenceError("")}>
                  Zamknij
                </button>
              </div>
            )}

            <section className="mode-switcher" aria-label="Tryb rozmowy">
              {modes.map((item) => (
                <button
                  className={item.id === mode ? "active" : ""}
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  title={item.description}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </section>

            <section className="model-switcher" aria-label="Model AI">
              {models.map((item) => (
                <button
                  className={item.id === model ? "active" : ""}
                  key={item.id}
                  type="button"
                  onClick={() => setModel(item.id)}
                  title={item.description}
                >
                  <span>{item.icon}</span>
                  {item.label}
                  <small>{item.description}</small>
                </button>
              ))}
            </section>

            <form className="composer" onSubmit={handleSubmit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onPaste={handlePaste}
                placeholder="Zadaj złożone zadanie albo wklej screenshot przez Ctrl+V..."
                rows={3}
              />
              <div className="composer-actions">
                <button type="button" onClick={resetConversation} disabled={isLoading}>
                  Nowa rozmowa
                </button>
                {isLoading ? (
                  <button type="button" onClick={stop}>
                    Stop
                  </button>
                ) : (
                  <button type="submit" disabled={isLoading || (!input.trim() && !pastedFile)}>
                    Wyślij
                  </button>
                )}
              </div>
            </form>
          </section>
        </section>
      </section>
    </main>
  );
}

