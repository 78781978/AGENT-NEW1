"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";

const scenarios = [
  "Planuję weekend w Krakowie. Sprawdź pogodę, znajdź ciekawe miejsca w Wikipedii i powiedz, czy są jakieś święta w ten weekend.",
  "Mam 5000 EUR do wydania. Przelicz na PLN, sprawdź ile to w dolarach i zapisz wszystkie kursy w notatkach.",
  "Porównaj pogodę w Warszawie, Berlinie i Paryżu. Które z tych miast ma dziś najlepszą pogodę?",
  "Ile dni do następnego święta w Polsce? Jaka będzie wtedy pogoda w Warszawie?",
  "Czym jest ReAct w AI? Znajdź definicję i sprawdź najnowsze zastosowania.",
];

const tools = [
  { key: "calculator", label: "Kalkulator", icon: "🧮" },
  { key: "currentDateTime", label: "Data i czas", icon: "CZ" },
  { key: "getWeather", label: "Pogoda", icon: "🌦️" },
  { key: "getExchangeRate", label: "Kursy walut", icon: "💱" },
  { key: "getHolidays", label: "Święta", icon: "📅" },
  { key: "searchWikipedia", label: "Wikipedia", icon: "📚" },
  { key: "readWebPage", label: "Czytanie stron", icon: "📄" },
  { key: "saveNote", label: "Zapis notatek", icon: "💾" },
  { key: "getNotes", label: "Notatki", icon: "🗂️" },
  { key: "google_search", label: "Google Search", icon: "WEB" },
  { key: "generateImage", label: "Generowanie grafik", icon: "🎨" },
];

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: Record<string, unknown>;
  errorText?: string;
};

type ReactSection = {
  kind: "thought" | "observation" | "result" | "text";
  title: string;
  content: string;
};

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getToolParts(message: UIMessage) {
  return message.parts.filter((part) => part.type.startsWith("tool-")) as ToolPart[];
}

function toolName(part: ToolPart) {
  return part.type.replace("tool-", "");
}

function toolMeta(name: string) {
  return tools.find((item) => item.key === name) ?? { key: name, label: name, icon: "⚙️" };
}

function summarizeToolOutput(part: ToolPart) {
  if (part.errorText) {
    return part.errorText;
  }

  if (!part.output) {
    return part.state === "input-available" ? "czekam na wynik" : "w toku";
  }

  const output = part.output;

  if (typeof output.result !== "undefined") {
    return `wynik: ${String(output.result)}`;
  }

  if (typeof output.converted !== "undefined") {
    return `${String(output.amount ?? "")} ${String(output.base ?? "")} = ${String(output.converted)} ${String(output.target ?? "")}`;
  }

  if (typeof output.current === "object" && output.current) {
    const current = output.current as Record<string, unknown>;
    return `${String(output.city ?? "miasto")}: ${String(current.temperatureC ?? "?")}°C, ${String(current.description ?? "pogoda")}`;
  }

  if (Array.isArray(output.upcoming)) {
    return `nadchodzące święta: ${output.upcoming.length}`;
  }

  if (Array.isArray(output.results)) {
    return `wyniki: ${output.results.length}`;
  }

  if (Array.isArray(output.notes)) {
    return `notatki: ${output.notes.length}`;
  }

  if (typeof output.content === "string") {
    return output.content.slice(0, 140);
  }

  if (typeof output.image === "string") {
    return `obraz: ${String(output.provider ?? "Google Gemini")} / ${String(output.model ?? "model")}`;
  }

  return "narzędzie zakończone";
}

function hasToolError(part: ToolPart) {
  const output = part.output as { error?: unknown; ok?: unknown } | undefined;

  return Boolean(part.errorText || output?.error || output?.ok === false);
}

function toolCounts(parts: ToolPart[]) {
  return parts.reduce<Record<string, number>>((counts, part) => {
    const name = toolName(part);
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
}

function diagnosticStatus(isLoading: boolean, steps: number) {
  if (isLoading) return "W trakcie...";
  if (steps >= 5) return "⚠️ Limit kroków";
  return "✅ Zadanie ukończone";
}

function progressLevel(steps: number) {
  if (steps >= 5) return "danger";
  if (steps >= 4) return "warning";
  return "ok";
}

function renderInline(text: string) {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }

    parts.push(
      <a href={match[2]} key={`${match[2]}-${match.index}`} rel="noreferrer" target="_blank">
        {match[1]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return parts.length ? parts : text;
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

function downloadImage(src: string) {
  const link = document.createElement("a");
  link.href = src;
  link.download = "react-generated-image.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function parseReactSections(text: string): ReactSection[] {
  const headingRegex = /^###\s*(Myślę|Mysle|Obserwuję|Obserwuje|Wynik końcowy|Wynik koncowy)\s*$/gim;
  const matches = [...text.matchAll(headingRegex)];

  if (matches.length === 0) {
    return text.trim()
      ? [{ kind: "text", title: "Odpowiedź", content: text.trim() }]
      : [];
  }

  const sections: ReactSection[] = [];
  const intro = text.slice(0, matches[0].index).trim();

  if (intro) {
    sections.push({ kind: "text", title: "Start", content: intro });
  }

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const heading = match[1].toLowerCase();
    const kind = heading.includes("obserw")
      ? "observation"
      : heading.includes("wynik")
        ? "result"
        : "thought";

    sections.push({
      kind,
      title:
        kind === "thought"
          ? "Myślę"
          : kind === "observation"
            ? "Obserwuję"
            : "Wynik końcowy",
      content: text.slice(start, end).trim(),
    });
  });

  return sections;
}

export default function ReactLoopPage() {
  const [input, setInput] = useState("");
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState("");
  const startRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/react",
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error, clearError, setMessages } = useChat({
    transport,
    onFinish({ message }) {
      if (startRef.current) {
        setDurations((current) => ({
          ...current,
          [message.id]: (performance.now() - startRef.current!) / 1000,
        }));
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    clearError();
    setLocalError("");
    setInput("");
    startRef.current = performance.now();

    try {
      await sendMessage({ text: trimmed });
    } catch (sendError) {
      setLocalError(
        sendError instanceof Error && sendError.message
          ? sendError.message
          : "Nie udało się połączyć z /api/react. Sprawdź, czy serwer lokalny działa i czy Vercel ma najnowszy deploy.",
      );
    }
  }

  function startScenario(scenario: string) {
    clearError();
    setLocalError("");
    setInput(scenario);
  }

  function resetConversation() {
    clearError();
    setLocalError("");
    setMessages([]);
    setDurations({});
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Agent ReAct">
        <AppNav active="/react" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 4 · Warsztat 1</p>
            <h1>🔄 Agent ReAct — Autonomiczne rozumowanie</h1>
            <p className="subtitle">
              Opisz cel, a agent sam zaplanuje kroki, użyje narzędzi, sprawdzi wyniki
              i przygotuje odpowiedź końcową.
            </p>
            <div className="sample-questions" aria-label="Scenariusze ReAct">
              {scenarios.map((scenario) => (
                <button key={scenario} type="button" onClick={() => startScenario(scenario)} disabled={isLoading}>
                  {scenario}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="react-layout">
          <aside className="tools-panel react-tools" aria-label="Narzędzia ReAct">
            <h2>Narzędzia agenta</h2>
            {tools.map((item) => (
              <article key={item.key}>
                <span>{item.icon}</span>
                <p>{item.label}</p>
                <strong>aktywny</strong>
              </article>
            ))}
          </aside>

          <section className="agent-chat">
            <div className="messages react-messages" aria-live="polite">
              {messages.length === 0 && (
                <div className="empty-state">
                  <p>
                    Wybierz scenariusz albo wpisz własny cel. Tu testujemy różnicę
                    między chatbotem a agentem: agent sam realizuje zadanie krok po kroku.
                  </p>
                </div>
              )}

              {messages.map((message) => {
                const text = messageText(message);
                const toolParts = getToolParts(message);
                const sections = parseReactSections(text);
                const progress = Math.min(
                  5,
                  Math.max(1, sections.filter((section) => section.kind === "thought").length),
                );
                const duration = durations[message.id];
                const diagnosticSteps = Math.min(5, Math.max(1, toolParts.length || progress));
                const errors = toolParts.filter(hasToolError);
                const counts = toolCounts(toolParts);

                return (
                  <article className={`message ${message.role}`} key={message.id}>
                    {message.role === "assistant" && (
                      <>
                        <div className="react-progress" aria-label={`Krok ${progress} z 5`}>
                          <span>Krok {progress} z 5</span>
                          <div>
                            <i style={{ width: `${(progress / 5) * 100}%` }} />
                          </div>
                        </div>

                        {toolParts.length > 0 && (
                          <div className="tool-timeline react-tool-timeline">
                            <strong>⚒ Narzędzia</strong>
                        {toolParts.map((part, index) => {
                          const name = toolName(part);
                          const meta = toolMeta(name);
                          const image = part.output?.image;

                          return (
                            <div className="tool-step" key={`${part.type}-${index}`}>
                              <span>{index + 1}</span>
                              <div>
                                    <h3>
                                  {meta.icon} {meta.label}
                                </h3>
                                <p>{summarizeToolOutput(part)}</p>
                                {typeof image === "string" && (
                                  <div className="tool-image">
                                    <img src={image} alt="Obraz wygenerowany przez ReAct" />
                                    <button type="button" onClick={() => downloadImage(image)}>
                                      💾 Pobierz
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                          </div>
                        )}

                        <section className="diagnostics-panel" aria-label="Diagnostyka">
                          <h3>🛡️ Diagnostyka</h3>
                          <div className={`diagnostic-progress ${progressLevel(diagnosticSteps)}`}>
                            <span>Kroki: {diagnosticSteps}/5</span>
                            <div>
                              <i style={{ width: `${(diagnosticSteps / 5) * 100}%` }} />
                            </div>
                          </div>
                          <p>
                            Narzędzia:{" "}
                            {Object.keys(counts).length
                              ? Object.entries(counts)
                                  .map(([name, count]) => `${name}(${count})`)
                                  .join(", ")
                              : "brak"}
                          </p>
                          <p>Błędy: {errors.length}</p>
                          <p>Czas: {duration ? `${duration.toFixed(1)}s` : isLoading ? "mierzę..." : "—"}</p>
                          <p>Status: {diagnosticStatus(isLoading, diagnosticSteps)}</p>
                          {errors.length > 0 ? (
                            <div className="diagnostic-alerts">
                              {errors.map((part, index) => (
                                <p key={`${part.type}-error-${index}`}>
                                  🔴 {toolName(part)} — {summarizeToolOutput(part)}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      </>
                    )}

                    {message.role === "assistant" ? (
                      <div className="react-sections">
                        {sections.map((section, index) => (
                          (() => {
                            const { body, source } = splitSourceLine(section.content);

                            return (
                              <section className={`react-section ${section.kind}`} key={`${section.kind}-${index}`}>
                                <h3>{section.title}</h3>
                                <p>{renderText(body)}</p>
                                {source ? <div className="message-source">{source}</div> : null}
                              </section>
                            );
                          })()
                        ))}
                      </div>
                    ) : (
                      <div className="bubble">{renderText(text)}</div>
                    )}

                    {message.role === "assistant" && (
                      <div className="tool-counter">
                        Użyto {toolParts.length} narzędzi
                        {duration ? ` | ${duration.toFixed(1)}s` : ""}
                        {" | Model: gemini-3.1-flash-lite"}
                      </div>
                    )}
                  </article>
                );
              })}

              {isLoading && (
                <article className="message assistant">
                  <div className="bubble thinking">Agent planuje i dobiera narzędzia...</div>
                </article>
              )}

              <div ref={bottomRef} />
            </div>

            {(error || localError) && (
              <div className="error-box">
                <p>
                  Coś poszło nie tak:{" "}
                  {error?.message || localError || "Brak szczegółów błędu."}
                </p>
                <button type="button" onClick={() => {
                  clearError();
                  setLocalError("");
                }}>
                  Wyczyść błąd
                </button>
              </div>
            )}

            <form className="composer" onSubmit={handleSubmit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Opisz co chcesz osiągnąć..."
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
                  <button type="submit" disabled={isLoading || !input.trim()}>
                    Uruchom ReAct
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

