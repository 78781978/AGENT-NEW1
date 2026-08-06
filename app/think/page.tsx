"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useEffect, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";

const thinkSamples = [
  "Firma ma 120 pracowników na umowę o pracę. 40% to kobiety. Spośród kobiet 25% pracuje zdalnie. Spośród mężczyzn 15% pracuje zdalnie. Ile osób łącznie pracuje zdalnie i jaki to procent całej firmy?",
  "Mam ofertę: 12 000 zł brutto na UoP vs 15 000 zł netto na B2B. Co się bardziej opłaca?",
];

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function ThinkPage() {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status, error, clearError, setMessages, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/think",
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

  return (
    <main className="chat-shell">
      <section className="chat-card" aria-label="Tryb głębokiego myślenia">
        <AppNav active="/think" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 2 · Warsztat 2</p>
            <h1>🧠 Tryb głębokiego myślenia</h1>
            <p className="subtitle">
              Agent pokazuje tok rozumowania krok po kroku.
            </p>
            <div className="sample-questions" aria-label="Pytania testowe z warsztatu">
              {thinkSamples.map((sample) => (
                <button key={sample} type="button" onClick={() => setInput(sample)}>
                  {sample}
                </button>
              ))}
            </div>
          </div>
          <div className="model-pill pro">🧠 Think</div>
        </header>

        <section className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>
                Zadaj trudne pytanie, a Vie rozbije je na zrozumienie, fakty,
                analizę, ocenę i finalną odpowiedź.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <article
              className={`message ${message.role}`}
              key={message.id}
              aria-label={message.role === "user" ? "Użytkownik" : "Agent AI"}
            >
              {message.role === "assistant" && (
                <div className="badge-row">
                  <span className="model-badge pro">🧠 think</span>
                </div>
              )}
              <div className="bubble">{messageText(message)}</div>
            </article>
          ))}

          {isLoading && (
            <article className="message assistant">
              <div className="badge-row">
                <span className="model-badge pro">🧠 think</span>
              </div>
              <div className="bubble thinking">Myślę krok po kroku...</div>
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
            🗑 Nowa analiza
          </button>
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Pytanie do trybu myślenia"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Zadaj trudne pytanie..."
            value={input}
          />
          {isLoading ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={isLoading || !input.trim()}>
              Wyślij
            </button>
          )}
        </form>
      </section>
    </main>
  );
}



