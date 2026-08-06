"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useEffect, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { washGoMockData } from "../../lib/washgo-data";

const customerSamples = [
  "Mam SUV-a, dużo sierści po psie i chcę przygotować auto do sprzedaży.",
  "W aucie czuć wilgoć i klimatyzacja nie pachnie najlepiej. Co polecacie?",
  "Mam plamy na tylnej kanapie po dzieciach. Ile może potrwać pranie tapicerki?",
  "Chcę szybko umyć auto z zewnątrz. Jakie macie najbliższe wolne terminy?",
];

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function WashBookingPage() {
  const [input, setInput] = useState(customerSamples[0]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, status, error, clearError, setMessages, stop } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/wash-booking",
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
      <section className="chat-card" aria-label="Wash&Go Booking Agent">
        <AppNav active="/wash-booking" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Obsługa klienta · Myjnia ręczna</p>
            <h1>🚗 Wash&Go Booking Agent</h1>
            <p className="subtitle">
              Opisz auto, problem i cel wizyty. Agent dobierze usługę, poda
              orientacyjny czas, widełki ceny i zaproponuje wolny termin.
            </p>
            <div className="sample-questions" aria-label="Przykładowe pytania klientów">
              {customerSamples.map((sample) => (
                <button key={sample} type="button" onClick={() => setInput(sample)}>
                  {sample}
                </button>
              ))}
            </div>
          </div>
          <div className="header-pills">
            <div className="model-pill pro">Doradca klienta</div>
            <div className="model-pill flash">
              Wolne: {washGoMockData.availableSlots.length}
            </div>
          </div>
        </header>

        <section className="memory-panel" aria-label="Dostępne terminy">
          <div className="memory-content">
            <p>
              Godziny rezerwacji: <strong>pon.-pt. 8:00-18:00, sob. 8:00-14:00</strong>
              <br />
              Zakres: <strong>{washGoMockData.bookingWindow}</strong>
              <br />
              Najbliższe wolne terminy:{" "}
              <strong>{washGoMockData.availableSlots.slice(0, 10).join(", ")}</strong>
            </p>
          </div>
        </section>

        <section className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>
                Napisz jakim autem przyjedziesz, co trzeba zrobić i czy zależy
                Ci na konkretnym terminie. Agent odpowie jak pracownik recepcji.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <article
              className={`message ${message.role}`}
              key={message.id}
              aria-label={message.role === "user" ? "Klient" : "Doradca Wash&Go"}
            >
              {message.role === "assistant" && (
                <div className="badge-row">
                  <span className="model-badge pro">🚗 Doradca</span>
                  <span className="badge casual">rezerwacja</span>
                </div>
              )}
              <div className="bubble">{messageText(message)}</div>
            </article>
          ))}

          {isLoading && (
            <article className="message assistant">
              <div className="badge-row">
                <span className="model-badge pro">🚗 Doradca</span>
              </div>
              <div className="bubble thinking">
                Dobieram usługę i sprawdzam wolne terminy...
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
            🗑 Nowa rozmowa
          </button>
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Opis auta i potrzeby klienta"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Np. Mam SUV-a, dużo sierści po psie i chcę przygotować auto do sprzedaży..."
            value={input}
          />
          {isLoading ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={isLoading || !input.trim()}>
              Zapytaj
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

