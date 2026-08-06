"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";

const scenarios = [
  "Planuję weekend w Berlinie. Budżet: 2000 PLN",
  "Lecę do Paryża na tydzień w sierpniu",
  "Wycieczka do Pragi z rodziną na 3 dni",
  "Podróż służbowa do Londynu w przyszłym tygodniu. Budżet 3000 PLN",
  "Porównaj Barcelonę i Lizbonę na wakacje",
];

const budgetProfiles = {
  ekonomiczny: {
    label: "Ekonomiczny",
    hotel: 160,
    food: 70,
    localTransport: 28,
    attractions: 35,
  },
  standard: {
    label: "Standard",
    hotel: 280,
    food: 120,
    localTransport: 45,
    attractions: 75,
  },
  komfortowy: {
    label: "Komfortowy",
    hotel: 460,
    food: 190,
    localTransport: 75,
    attractions: 140,
  },
};

type BudgetProfileKey = keyof typeof budgetProfiles;

const accommodationSuggestions: Record<
  string,
  Array<{
    name: string;
    type: string;
    bestFor: string;
    area: string;
    priceLevel: string;
  }>
> = {
  berlin: [
    {
      name: "Hotel przy Alexanderplatz",
      type: "hotel miejski",
      bestFor: "pierwszy wyjazd i szybkie zwiedzanie",
      area: "centrum / Alexanderplatz",
      priceLevel: "średni budżet",
    },
    {
      name: "Apartament w Prenzlauer Berg",
      type: "apartament",
      bestFor: "spokojny wyjazd we dwoje lub z rodziną",
      area: "Prenzlauer Berg",
      priceLevel: "średni budżet",
    },
    {
      name: "Hostel butikowy przy Ostbahnhof",
      type: "hostel / budżetowy hotel",
      bestFor: "tani weekend i dobry dojazd",
      area: "Friedrichshain",
      priceLevel: "ekonomiczny",
    },
  ],
  paryż: [
    {
      name: "Hotel w okolicy Montmartre",
      type: "hotel miejski",
      bestFor: "klimatyczny wyjazd i spacery",
      area: "Montmartre",
      priceLevel: "średni budżet",
    },
    {
      name: "Apartament przy Bastille",
      type: "apartament",
      bestFor: "wygodna baza na kilka dni",
      area: "Bastille / Le Marais",
      priceLevel: "komfortowy",
    },
    {
      name: "Hotel ekonomiczny przy metrze",
      type: "hotel budżetowy",
      bestFor: "niższy koszt i sprawny transport",
      area: "okolice stacji metra",
      priceLevel: "ekonomiczny",
    },
  ],
  praga: [
    {
      name: "Hotel przy Starym Mieście",
      type: "hotel miejski",
      bestFor: "krótki wyjazd i zwiedzanie pieszo",
      area: "Stare Miasto",
      priceLevel: "średni budżet",
    },
    {
      name: "Apartament w dzielnicy Vinohrady",
      type: "apartament",
      bestFor: "spokojniejsza okolica i restauracje",
      area: "Vinohrady",
      priceLevel: "średni budżet",
    },
    {
      name: "Pensjonat poza ścisłym centrum",
      type: "pensjonat",
      bestFor: "tańszy nocleg przy dobrym dojeździe",
      area: "Praga 3 / Praga 8",
      priceLevel: "ekonomiczny",
    },
  ],
  kraków: [
    {
      name: "Hotel przy Rynku Głównym",
      type: "hotel miejski",
      bestFor: "zwiedzanie bez samochodu",
      area: "Stare Miasto",
      priceLevel: "komfortowy",
    },
    {
      name: "Apartament na Kazimierzu",
      type: "apartament",
      bestFor: "restauracje, spacery i klimat miasta",
      area: "Kazimierz",
      priceLevel: "średni budżet",
    },
    {
      name: "Hotel przy dworcu",
      type: "hotel budżetowy",
      bestFor: "krótki pobyt i łatwy dojazd",
      area: "okolice dworca",
      priceLevel: "ekonomiczny",
    },
  ],
};

const defaultAccommodationSuggestions = [
  {
    name: "Hotel blisko centrum",
    type: "hotel miejski",
    bestFor: "pierwszy pobyt i wygodne zwiedzanie",
    area: "centrum miasta",
    priceLevel: "średni budżet",
  },
  {
    name: "Apartament z aneksem kuchennym",
    type: "apartament",
    bestFor: "rodzina, para lub dłuższy pobyt",
    area: "dobry dojazd do atrakcji",
    priceLevel: "średni budżet",
  },
  {
    name: "Nocleg ekonomiczny przy komunikacji",
    type: "hotel budżetowy / pensjonat",
    bestFor: "niższy koszt i praktyczna baza",
    area: "blisko transportu publicznego",
    priceLevel: "ekonomiczny",
  },
];

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function bookingSearchUrl(city: string, query?: string) {
  const destination = query ? `${query} ${city}` : city;
  const url = new URL("https://www.booking.com/searchresults.pl.html");
  url.searchParams.set("ss", destination);
  url.searchParams.set("group_adults", "2");
  url.searchParams.set("no_rooms", "1");
  url.searchParams.set("group_children", "0");

  return url.toString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "PLN",
  }).format(value);
}

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: Record<string, unknown>;
  errorText?: string;
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

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    getWeather: "Pogoda",
    getExchangeRate: "Waluta",
    getHolidays: "Święta",
    searchWikipedia: "Atrakcje",
    calculator: "Budżet",
  };

  return labels[name] ?? name;
}

function summarizeTool(part: ToolPart) {
  if (part.errorText) return part.errorText;
  if (!part.output) return "w toku";
  const output = part.output;

  if (typeof output.current === "object" && output.current) {
    const current = output.current as Record<string, unknown>;

    return `${String(output.city ?? "miasto")}: ${String(current.temperatureC ?? "?")}°C, ${String(current.description ?? "pogoda")}`;
  }

  if (typeof output.plnForOneUnit !== "undefined") {
    return `1 ${String(output.currency ?? "waluta")} = ${String(output.plnForOneUnit)} PLN`;
  }

  if (Array.isArray(output.upcoming)) {
    return output.upcoming.length ? `nadchodzące święta: ${output.upcoming.length}` : "brak bliskich świąt";
  }

  if (Array.isArray(output.results)) {
    return `znalezione miejsca: ${output.results.length}`;
  }

  if (typeof output.result !== "undefined") {
    return `wynik: ${String(output.result)}`;
  }

  return "dane pobrane";
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
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Fragment key={`plain-${lastIndex}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }

    parts.push(<strong key={`${match[1]}-${match.index}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={`plain-${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return parts.length ? parts : text;
}

function renderMarkdown(text: string) {
  return text.split("\n").map((line, index) => {
    if (line.startsWith("## ")) {
      return <h2 key={`${line}-${index}`}>{renderInline(line.replace(/^##\s*/, ""))}</h2>;
    }

    if (line.startsWith("### ")) {
      return <h3 key={`${line}-${index}`}>{renderInline(line.replace(/^###\s*/, ""))}</h3>;
    }

    if (line.startsWith("|")) {
      return (
        <pre className="travel-table-line" key={`${line}-${index}`}>
          {line}
        </pre>
      );
    }

    if (line.startsWith("- ")) {
      return <p className="travel-list-item" key={`${line}-${index}`}>{renderInline(line)}</p>;
    }

    return line.trim() ? <p key={`${line}-${index}`}>{renderInline(line)}</p> : <br key={`br-${index}`} />;
  });
}

export default function TravelPage() {
  const [input, setInput] = useState("");
  const [hotelCity, setHotelCity] = useState("Berlin");
  const [confirmedHotelCity, setConfirmedHotelCity] = useState("Berlin");
  const [budgetPeople, setBudgetPeople] = useState(2);
  const [budgetDays, setBudgetDays] = useState(3);
  const [budgetProfile, setBudgetProfile] = useState<BudgetProfileKey>("standard");
  const [transportCost, setTransportCost] = useState(500);
  const [reservePercent, setReservePercent] = useState(15);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<number | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/travel",
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
  const hotelSuggestions = useMemo(() => {
    const normalized = normalizeKey(confirmedHotelCity);
    const exact = accommodationSuggestions[normalized];

    return exact ?? defaultAccommodationSuggestions;
  }, [confirmedHotelCity]);
  const budget = useMemo(() => {
    const profile = budgetProfiles[budgetProfile];
    const safePeople = Math.max(1, budgetPeople || 1);
    const safeDays = Math.max(1, budgetDays || 1);
    const dailyPerPerson = profile.hotel + profile.food + profile.localTransport + profile.attractions;
    const stay = dailyPerPerson * safePeople * safeDays;
    const transportTotal = Math.max(0, transportCost || 0) * safePeople;
    const base = stay + transportTotal;
    const reserve = base * (Math.max(0, reservePercent || 0) / 100);
    const total = base + reserve;

    return {
      profile,
      stay,
      transportTotal,
      reserve,
      total,
      perPerson: total / safePeople,
      perDay: total / safeDays,
    };
  }, [budgetDays, budgetPeople, budgetProfile, reservePercent, transportCost]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();

    if (!trimmed || isLoading) return;

    clearError();
    setInput("");
    startRef.current = performance.now();
    await sendMessage({ text: trimmed });
  }

  function startScenario(scenario: string) {
    clearError();
    setInput(scenario);
  }

  function confirmHotelCity(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmedCity = hotelCity.trim();

    if (!trimmedCity) return;

    setConfirmedHotelCity(trimmedCity);
  }

  function resetConversation() {
    clearError();
    setMessages([]);
    setDurations({});
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide travel-card" aria-label="Asystent podróży AI">
        <AppNav active="/travel" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 4 · Warsztat 2</p>
            <h1>Asystent podróży AI</h1>
            <p className="subtitle">
              Powiedz dokąd jedziesz, a agent sprawdzi pogodę, walutę, święta i atrakcje,
              a potem przygotuje gotowy plan wyjazdu.
            </p>
            <div className="sample-questions" aria-label="Scenariusze podróży">
              {scenarios.map((scenario) => (
                <button key={scenario} type="button" onClick={() => startScenario(scenario)}>
                  {scenario}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={resetConversation}>
            Nowy plan
          </button>
        </header>

        <section className="travel-budget-panel" aria-label="Budżet podróży">
          <div className="travel-budget-heading">
            <div>
              <p className="eyebrow">Nowa funkcja</p>
              <h2>Asystent budżetu podróży</h2>
              <p>
                Policz orientacyjny koszt wyjazdu przed rozmową z agentem. To szybki kalkulator
                do decyzji: czy budżet jest realistyczny i ile warto zostawić rezerwy.
              </p>
            </div>
            <strong>{formatMoney(budget.total)}</strong>
          </div>

          <div className="travel-budget-grid">
            <label>
              Liczba osób
              <input
                min="1"
                onChange={(event) => setBudgetPeople(Number(event.target.value))}
                type="number"
                value={budgetPeople}
              />
            </label>
            <label>
              Liczba dni
              <input
                min="1"
                onChange={(event) => setBudgetDays(Number(event.target.value))}
                type="number"
                value={budgetDays}
              />
            </label>
            <label>
              Transport / osoba
              <input
                min="0"
                onChange={(event) => setTransportCost(Number(event.target.value))}
                type="number"
                value={transportCost}
              />
            </label>
            <label>
              Rezerwa %
              <input
                min="0"
                onChange={(event) => setReservePercent(Number(event.target.value))}
                type="number"
                value={reservePercent}
              />
            </label>
          </div>

          <div className="travel-budget-profiles" aria-label="Styl podróży">
            {(Object.keys(budgetProfiles) as BudgetProfileKey[]).map((key) => (
              <button
                className={budgetProfile === key ? "active" : ""}
                key={key}
                onClick={() => setBudgetProfile(key)}
                type="button"
              >
                {budgetProfiles[key].label}
              </button>
            ))}
          </div>

          <div className="travel-budget-summary">
            <article>
              <span>Nocleg, jedzenie i atrakcje</span>
              <strong>{formatMoney(budget.stay)}</strong>
            </article>
            <article>
              <span>Transport</span>
              <strong>{formatMoney(budget.transportTotal)}</strong>
            </article>
            <article>
              <span>Rezerwa</span>
              <strong>{formatMoney(budget.reserve)}</strong>
            </article>
            <article>
              <span>Na osobę</span>
              <strong>{formatMoney(budget.perPerson)}</strong>
            </article>
          </div>

          <button
            className="travel-budget-send"
            onClick={() =>
              setInput(
                `Przygotuj plan podróży z budżetem około ${Math.round(
                  budget.total,
                )} PLN. Liczba osób: ${budgetPeople}, liczba dni: ${budgetDays}, styl: ${
                  budget.profile.label
                }.`,
              )
            }
            type="button"
          >
            Wstaw budżet do rozmowy z agentem
          </button>
        </section>

        <section className="travel-hotel-panel" aria-label="Propozycje noclegów">
          <div className="travel-budget-heading">
            <div>
              <p className="eyebrow">Nowa funkcja</p>
              <h2>3 propozycje noclegów z weryfikacją na Booking.com</h2>
              <p>
                Wpisz miasto, a asystent pokaże trzy typy noclegów do sprawdzenia. Aktualne ceny,
                oceny i dostępność potwierdzasz bezpośrednio na Booking.com.
              </p>
            </div>
            <a
              className="travel-hotel-main-link"
              href={bookingSearchUrl(confirmedHotelCity)}
              rel="noreferrer"
              target="_blank"
            >
              Sprawdź Booking
            </a>
          </div>

          <form className="travel-hotel-search" onSubmit={confirmHotelCity}>
            <label>
              Miasto
              <input
                onChange={(event) => setHotelCity(event.target.value)}
                placeholder="Np. Berlin, Paryż, Praga, Kraków"
                type="text"
                value={hotelCity}
              />
            </label>
            <button disabled={!hotelCity.trim()} type="submit">
              Pokaż 3 propozycje
            </button>
            <small>Enter w polu miasta działa tak samo jak przycisk.</small>
          </form>

          <p className="travel-hotel-current">Propozycje dla miasta: {confirmedHotelCity}</p>

          <div className="travel-hotel-grid">
            {hotelSuggestions.map((hotel, index) => (
              <article key={`${hotel.name}-${index}`}>
                <span>Propozycja {index + 1}</span>
                <h3>{hotel.name}</h3>
                <p>
                  <strong>{hotel.type}</strong> · {hotel.area}
                </p>
                <p>{hotel.bestFor}</p>
                <small>{hotel.priceLevel}</small>
                <a href={bookingSearchUrl(confirmedHotelCity, hotel.name)} rel="noreferrer" target="_blank">
                  Sprawdź na Booking.com
                </a>
              </article>
            ))}
          </div>

          <button
            className="travel-budget-send"
            onClick={() =>
              setInput(
                `Zaplanuj podróż do miasta ${confirmedHotelCity}. Uwzględnij budżet około ${Math.round(
                  budget.total,
                )} PLN i doradź, który typ noclegu wybrać: hotel w centrum, apartament czy tańszy nocleg przy komunikacji. Podaj kryteria sprawdzania noclegu na Booking.com.`,
              )
            }
            type="button"
          >
            Wstaw noclegi do rozmowy z agentem
          </button>
        </section>

        <section className="travel-layout">
          <aside className="tools-panel travel-tools" aria-label="Co sprawdza agent">
            <article>
              <span>🌤️</span>
              <strong>Pogoda</strong>
              <small>Open-Meteo</small>
            </article>
            <article>
              <span>💶</span>
              <strong>Waluta</strong>
              <small>NBP</small>
            </article>
            <article>
              <span>📅</span>
              <strong>Święta</strong>
              <small>Nager.Date</small>
            </article>
            <article>
              <span>🏛️</span>
              <strong>Atrakcje</strong>
              <small>Wikipedia</small>
            </article>
          </aside>

          <div className="messages travel-messages" aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty-state">
                <p>Wybierz przykład albo wpisz własny plan podróży.</p>
                <small>Przykład: Lecę do Londynu. Budżet 3000 PLN.</small>
              </div>
            ) : null}

            {messages.map((message) => {
              const text = messageText(message);
              const toolParts = getToolParts(message);
              const diagnosticSteps = Math.min(5, Math.max(1, toolParts.length));
              const errors = toolParts.filter(hasToolError);
              const counts = toolCounts(toolParts);
              const duration = durations[message.id];

              return (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="bubble">
                    {message.role === "assistant" && toolParts.length > 0 ? (
                      <div className="travel-data-grid">
                        {toolParts.map((part, index) => {
                          const name = toolName(part);

                          return (
                            <section className="travel-data-card" key={`${name}-${index}`}>
                              <span>{toolLabel(name)}</span>
                              <p>{summarizeTool(part)}</p>
                            </section>
                          );
                        })}
                      </div>
                    ) : null}

                    {message.role === "assistant" ? (
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
                                🔴 {toolName(part)} — {summarizeTool(part)}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {text ? <div className="travel-answer">{renderMarkdown(text)}</div> : null}
                  </div>
                </article>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </section>

        {error ? (
          <div className="error-box">
            <span>Coś poszło nie tak: {error.message}</span>
            <button type="button" onClick={clearError}>
              Wyczyść błąd
            </button>
          </div>
        ) : null}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Plan podróży"
            onChange={(event) => setInput(event.target.value)}
            placeholder="Np. Lecę do Barcelony na weekend..."
            value={input}
          />
          <div className="composer-actions">
            {isLoading ? (
              <button type="button" onClick={stop}>
                Stop
              </button>
            ) : null}
            <button disabled={isLoading || !input.trim()} type="submit">
              Zaplanuj podróż
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

