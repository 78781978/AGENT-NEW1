"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

const sampleQuestions = [
  "Jakie są najnowsze wiadomości o sztucznej inteligencji?",
  "Ile kosztuje iPhone 16 Pro w Polsce?",
  "Kto wygrał ostatni mecz reprezentacji Polski?",
  "Jakie filmy są teraz w kinach?",
  "Przeczytaj tę stronę: https://pl.wikipedia.org/wiki/Sztuczna_inteligencja",
];

type SearchMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Array<{ title: string; url: string }>;
};

function renderInline(text: string) {
  const parts: ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    const [fullMatch, label, url] = match;

    if (match.index > lastIndex) {
      parts.push(
        <Fragment key={`text-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>,
      );
    }

    parts.push(
      <a href={url} key={`${url}-${match.index}`} target="_blank" rel="noreferrer">
        {label}
      </a>,
    );

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={`text-${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return parts.length ? parts : text;
}

function renderAnswer(text: string) {
  return text.split("\n").map((line, index) => (
    <Fragment key={`${line}-${index}`}>
      {renderInline(line)}
      {index < text.split("\n").length - 1 ? <br /> : null}
    </Fragment>
  ));
}

export default function SearchPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<SearchMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: SearchMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
    };

    setInput("");
    setError(null);
    setIsLoading(true);
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = (await response.json()) as {
        text?: string;
        error?: string;
        sources?: Array<{ title: string; url: string }>;
      };

      if (!response.ok || !data.text) {
        throw new Error(data.error || "Wyszukiwarka nie zwróciła odpowiedzi.");
      }

      const answerText = data.text;

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: answerText,
          sources: data.sources ?? [],
        },
      ]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udało się połączyć z wyszukiwarką.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function useSampleQuestion(question: string) {
    setInput(question);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card" aria-label="Agent z wyszukiwarka">
        <AppNav active="/search" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 3 · Warsztat 1</p>
            <h1>Agent z wyszukiwarką</h1>
            <p className="subtitle">
              Przeszukuję prawdziwy internet i czytam strony. Podaj pytanie
              aktualne albo wklej link do strony, którą mam streścić.
            </p>
            <div className="sample-questions" aria-label="Przykładowe pytania">
              {sampleQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => useSampleQuestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>
                Zapytaj o coś aktualnego albo wklej adres strony. Agent może
                użyć Google Search oraz narzędzia do czytania stron WWW.
              </p>
            </div>
          )}

          {messages.map((message) => {
            const sources = message.role === "assistant" ? (message.sources ?? []) : [];

            return (
              <article
                className={`message ${message.role}`}
                key={message.id}
                aria-label={message.role === "user" ? "Użytkownik" : "Agent AI"}
              >
                {message.role === "assistant" && (
                  <span className="badge expert">WEB</span>
                )}
                <div className="bubble search-bubble">{renderAnswer(message.text)}</div>
                {sources.length > 0 && (
                  <div className="source-list" aria-label="Źródła">
                    <strong>Źródła:</strong>
                    {sources.map((source) => (
                      <a
                        href={source.url}
                        key={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                )}
              </article>
            );
          })}

          {isLoading && (
            <article className="message assistant">
              <span className="badge expert">WEB</span>
              <div className="bubble thinking">Szukam i sprawdzam źródła...</div>
            </article>
          )}

          <div ref={bottomRef} />
        </section>

        {error && (
          <div className="error-box">
            <p>Coś poszło nie tak: {error}</p>
            <button type="button" onClick={() => setError(null)}>
              Wyczyść błąd
            </button>
          </div>
        )}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Zapytaj o cokolwiek aktualnego..."
            rows={3}
          />
          <div className="composer-actions">
            <button type="button" onClick={() => setMessages([])} disabled={isLoading}>
              Nowa rozmowa
            </button>
            <button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? "Szukam..." : "Wyślij"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}



