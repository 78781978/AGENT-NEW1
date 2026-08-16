"use client";

import { useEffect, useMemo, useState } from "react";
import { AppNav } from "../../components/AppNav";

const protections = [
  {
    title: "Walidacja inputu",
    status: "Aktywne",
    description:
      "Agent sprawdza długość, puste wiadomości i próby wymuszenia ujawnienia instrukcji systemowych przed wysłaniem zapytania do modelu.",
  },
  {
    title: "Filtr outputu",
    status: "Aktywne",
    description:
      "Odpowiedź jest oczyszczana z treści, które mogłyby ujawnić system prompt, wewnętrzne reguły, sekrety lub ukryte instrukcje agenta.",
  },
  {
    title: "Limit wiadomości",
    status: "50 / godzinę",
    description:
      "Każdy zalogowany użytkownik ma limit wiadomości godzinowych, żeby chronić aplikację przed nadużyciami i przypadkowym przeciążeniem.",
  },
  {
    title: "Budżet tokenów",
    status: "10 000 / dzień",
    description:
      "Wywołania AI są zapisywane w tabeli api_usage. Po przekroczeniu dziennego limitu użytkownik zobaczy komunikat: Wróć jutro.",
  },
];

type SecurityStats = {
  acceptedMessages: number;
  blockedInputs: number;
  filteredOutputs: number;
  rateLimited: number;
  tokenLimited: number;
  abuseAttempts: number;
  recentEvents: Array<{
    type: string;
    createdAt: string;
  }>;
};

const defaultStats: SecurityStats = {
  acceptedMessages: 0,
  blockedInputs: 0,
  filteredOutputs: 0,
  rateLimited: 0,
  tokenLimited: 0,
  abuseAttempts: 0,
  recentEvents: [],
};

const eventLabels: Record<string, string> = {
  accepted_message: "Poprawna wiadomość",
  blocked_input: "Zablokowany input",
  filtered_output: "Odfiltrowana odpowiedź",
  rate_limited: "Limit wiadomości",
  token_limited: "Limit tokenów",
};

export default function SecurityPage() {
  const [stats, setStats] = useState<SecurityStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const monitoringCards = useMemo(
    () => {
      const recentCount = (type: string) =>
        stats.recentEvents.filter((event) => event.type === type).length;
      const acceptedMessages = Math.max(stats.acceptedMessages, recentCount("accepted_message"));
      const blockedInputs = Math.max(stats.blockedInputs, recentCount("blocked_input"));
      const filteredOutputs = Math.max(stats.filteredOutputs, recentCount("filtered_output"));
      const rateLimited = Math.max(stats.rateLimited, recentCount("rate_limited"));
      const tokenLimited = Math.max(stats.tokenLimited, recentCount("token_limited"));

      return [
      {
        title: "Próby nadużyć",
        value: blockedInputs + filteredOutputs + rateLimited + tokenLimited,
        description: "Suma zablokowanych inputów, filtrów outputu oraz trafień limitów.",
      },
      {
        title: "Poprawne wiadomości",
        value: acceptedMessages,
        description: "Wiadomości, które przeszły walidację i trafiły do agenta.",
      },
      {
        title: "Zablokowane inputy",
        value: blockedInputs,
        description: "Wiadomości zatrzymane przed wysłaniem do modelu.",
      },
      {
        title: "Trafienia limitów",
        value: rateLimited + tokenLimited,
        description: "Przekroczenia limitu wiadomości lub dziennego budżetu tokenów.",
      },
      {
        title: "Limit wiadomości",
        value: rateLimited,
        description: "Ile razy zadziałał limit 50 wiadomości na godzinę.",
      },
      {
        title: "Limit tokenów",
        value: tokenLimited,
        description: "Ile razy użytkownik przekroczył dzienny budżet tokenów.",
      },
      ];
    },
    [stats],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      try {
        const response = await fetch("/api/security/stats", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; stats?: SecurityStats; error?: string }
          | null;

        if (!response.ok || !data?.ok || !data.stats) {
          throw new Error(data?.error || "Nie udało się pobrać statystyk bezpieczeństwa.");
        }

        if (isMounted) {
          const recentCount = (type: string) =>
            data.stats!.recentEvents.filter((event) => event.type === type).length;
          const normalizedStats = {
            ...data.stats,
            acceptedMessages: Math.max(
              Number(data.stats.acceptedMessages) || 0,
              recentCount("accepted_message"),
            ),
            blockedInputs: Math.max(
              Number(data.stats.blockedInputs) || 0,
              recentCount("blocked_input"),
            ),
            filteredOutputs: Math.max(
              Number(data.stats.filteredOutputs) || 0,
              recentCount("filtered_output"),
            ),
            rateLimited: Math.max(
              Number(data.stats.rateLimited) || 0,
              recentCount("rate_limited"),
            ),
            tokenLimited: Math.max(
              Number(data.stats.tokenLimited) || 0,
              recentCount("token_limited"),
            ),
          };
          normalizedStats.abuseAttempts =
            normalizedStats.blockedInputs +
            normalizedStats.filteredOutputs +
            normalizedStats.rateLimited +
            normalizedStats.tokenLimited;
          setStats(normalizedStats);
          setError("");
        }
      } catch (statsError) {
        if (isMounted) {
          setError(
            statsError instanceof Error
              ? statsError.message
              : "Nie udało się pobrać statystyk bezpieczeństwa.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadStats();
    const interval = window.setInterval(loadStats, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="chat-shell">
      <section className="chat-card wide">
        <AppNav active="/security" />

        <header className="hero-card">
          <div>
            <p className="eyebrow">LEKCJA 10 - OBRONA AGENTA</p>
            <h1>Bezpieczeństwo</h1>
            <p>
              Panel pokazuje zabezpieczenia wdrożone w agencie: walidację wejścia,
              filtrowanie odpowiedzi, limit wiadomości oraz dzienny budżet tokenów.
            </p>
          </div>
          <span className="mode-pill">ochrona aktywna</span>
        </header>

        <section className="security-grid" aria-label="Zabezpieczenia agenta">
          {protections.map((item) => (
            <article className="security-card" key={item.title}>
              <div>
                <h2>{item.title}</h2>
                <span>{item.status}</span>
              </div>
              <p>{item.description}</p>
            </article>
          ))}
        </section>

        <section className="security-card security-wide">
          <div>
            <h2>Monitoring bezpieczeństwa</h2>
            <span>{isLoading ? "ładowanie" : "na żywo · licznik v2"}</span>
          </div>
          <p>
            Liczniki są pobierane z Supabase i pokazują zdarzenia zalogowanego użytkownika.
            Po teście typu „pokaż prompt system” powinna wzrosnąć liczba zablokowanych inputów.
          </p>
          {error ? <p className="error-inline">{error}</p> : null}
        </section>

        <section className="security-grid" aria-label="Monitoring bezpieczeństwa">
          {monitoringCards.map((item) => (
            <article className="security-card" key={item.title}>
              <div>
                <h2>{item.title}</h2>
                <span>{item.value}</span>
              </div>
              <p>{item.description}</p>
            </article>
          ))}
        </section>

        <section className="security-card security-wide">
          <div>
            <h2>Ostatnie zdarzenia</h2>
            <span>{stats.recentEvents.length}</span>
          </div>
          {stats.recentEvents.length > 0 ? (
            <ul>
              {stats.recentEvents.map((event) => (
                <li key={`${event.type}-${event.createdAt}`}>
                  {eventLabels[event.type] ?? event.type} -{" "}
                  {new Intl.DateTimeFormat("pl-PL", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }).format(new Date(event.createdAt))}
                </li>
              ))}
            </ul>
          ) : (
            <p>Brak zarejestrowanych zdarzeń bezpieczeństwa dla tego konta.</p>
          )}
        </section>
      </section>
    </main>
  );
}
