"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useEffect, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import {
  washGoBusinessContext,
  washGoMockData,
  washGoServices,
} from "../../lib/washgo-data";

const sampleTasks = [
  "Mam myjnię ręczną w Goleniowie. Mam wolne terminy w tym tygodniu. Pada deszcz. Chcę zdobyć klientów na pranie tapicerki i mycie kompleksowe.",
  "/email Klient napisał, że po praniu tapicerki nadal czuje wilgoć i jest niezadowolony.",
  "/email Klient chce rabat 50%, bo twierdzi, że konkurencja robi taniej.",
  "Chcę wypromować ozonowanie po zimie. Przygotuj post, rolkę, grupy lokalne i odpowiedzi na komentarze.",
];

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function WashAgentPage() {
  const [input, setInput] = useState(sampleTasks[0]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status, error, clearError, setMessages, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/wash",
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
      <section className="chat-card wide" aria-label="Wash&Go Revenue Agent">
        <AppNav active="/wash" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Praca domowa · Komenda biznesowa</p>
            <h1>Wash&Go Revenue Agent</h1>
            <p className="subtitle">
              Agent sprzedażowo-operacyjny dla właściciela myjni. Tworzy
              kampanie, odpowiada na trudne wiadomości klientów i pilnuje zasad
              biznesowych. Komenda pracy domowej: <strong>/email</strong>.
            </p>
            <div className="sample-questions" aria-label="Przykładowe zadania">
              {sampleTasks.map((task) => (
                <button key={task} type="button" onClick={() => setInput(task)}>
                  {task}
                </button>
              ))}
            </div>
          </div>
          <div className="header-pills">
            <div className="model-pill pro">Revenue Agent</div>
            <div className="model-pill flash">Komenda /email</div>
            <div className="model-pill expert">Few-shot prompting</div>
          </div>
        </header>

        <section className="business-grid" aria-label="Dane testowe agenta">
          <article className="info-card">
            <h2>Dane firmy</h2>
            <p>
              <strong>{washGoBusinessContext.brandName}</strong>
              <br />
              {washGoBusinessContext.location}
              <br />
              {washGoBusinessContext.openingHours}
            </p>
          </article>

          <article className="info-card">
            <h2>Komenda biznesowa</h2>
            <p>
              Wpisz <strong>/email</strong> i opisz sytuację klienta. Agent
              zwróci gotowy e-mail w jednolitym formacie.
            </p>
          </article>

          <article className="info-card">
            <h2>Mock operacyjny</h2>
            <p>
              Pogoda: {washGoMockData.weather}
              <br />
              Zakres rezerwacji: {washGoMockData.bookingWindow}
              <br />
              Najbliższe terminy: {washGoMockData.availableSlots.slice(0, 8).join(", ")}
            </p>
          </article>
        </section>

        <section className="services-panel" aria-label="Lista usług myjni">
          <h2>Usługi testowe</h2>
          <div className="services-list">
            {washGoServices.map((service) => (
              <article key={service.name}>
                <h3>{service.name}</h3>
                <p>
                  {service.duration} · {service.price}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>
                Wybierz przykład z komendą <strong>/email</strong> albo opisz
                własną sytuację. Agent przygotuje materiał gotowy do użycia.
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
                  <span className="model-badge pro">WGO</span>
                  <span className="badge creative">/email</span>
                </div>
              )}
              <div className="bubble">{messageText(message)}</div>
            </article>
          ))}

          {isLoading && (
            <article className="message assistant">
              <div className="badge-row">
                <span className="model-badge pro">WGO</span>
              </div>
              <div className="bubble thinking">
                Przygotowuję profesjonalny materiał biznesowy...
              </div>
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
            🗑 Nowe zadanie
          </button>
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Zadanie dla agenta myjni"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="/email Klient napisał, że..."
            value={input}
          />
          {isLoading ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={isLoading || !input.trim()}>
              Generuj
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

