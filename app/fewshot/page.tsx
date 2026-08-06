"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useEffect, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";

const dictionaryTerms = [
  "Sztuczna inteligencja",
  "Agent AI",
  "Prompt",
  "Halucynacja AI",
  "RAG",
  "API",
];

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function renderMessageText(text: string) {
  return text.split("\n").map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);

    return (
      <span key={`${line}-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={`${part}-${partIndex}`}>{part.slice(2, -2)}</strong>;
          }

          return part;
        })}
        {lineIndex < text.split("\n").length - 1 && <br />}
      </span>
    );
  });
}

export default function FewShotPage() {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status, error, clearError, setMessages, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/fewshot",
      }),
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

    setInput("");
    await sendMessage({ text: trimmed });
  }

  async function handleTermClick(term: string) {
    if (isLoading) {
      return;
    }

    setInput("");
    await sendMessage({ text: `Czym jest ${term}?` });
  }

  return (
    <main className="chat-shell">
      <section className="chat-card" aria-label="Słownik AI">
        <AppNav active="/fewshot" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 2 · Warsztat 3</p>
            <h1>📚 Słownik AI</h1>
            <p className="subtitle">
              Wyjaśniam trudne pojęcia prostym językiem.
            </p>
            <div className="sample-questions" aria-label="Przykładowe pojęcia">
              {dictionaryTerms.map((term) => (
                <button
                  disabled={isLoading}
                  key={term}
                  type="button"
                  onClick={() => handleTermClick(term)}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
          <div className="model-pill creative">few-shot</div>
        </header>

        <section className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>
                Wpisz pojęcie, a Vie wyjaśni je zawsze w tym samym formacie:
                termin, prosta analogia, przykład z praktyki i powiązane hasła.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <article
              className={`message ${message.role}`}
              key={message.id}
              aria-label={message.role === "user" ? "Użytkownik" : "Słownik AI"}
            >
              {message.role === "assistant" && (
                <div className="badge-row">
                  <span className="model-badge creative">📚 słownik</span>
                  <span className="badge expert">few-shot</span>
                </div>
              )}
              <div className="bubble">{renderMessageText(messageText(message))}</div>
            </article>
          ))}

          {isLoading && (
            <article className="message assistant">
              <div className="badge-row">
                <span className="model-badge creative">📚 słownik</span>
              </div>
              <div className="bubble thinking">Szukam prostej analogii...</div>
            </article>
          )}

          <div ref={bottomRef} />
        </section>

        {error && (
          <div className="error-box">
            <p>{error.message}</p>
            <button type="button" onClick={clearError}>
              Zamknij
            </button>
          </div>
        )}

        <div className="memory-actions standalone">
          <button type="button" onClick={() => setMessages([])}>
            🗑 Nowe pojęcie
          </button>
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Pojęcie do wyjaśnienia"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Wpisz pojęcie do wyjaśnienia..."
            value={input}
          />
          {isLoading ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={isLoading || !input.trim()}>
              Wyjaśnij
            </button>
          )}
        </form>
      </section>
    </main>
  );
}



