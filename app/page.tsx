"use client";

import Link from "next/link";
import Image from "next/image";
import { AppNav } from "../components/AppNav";
import { useEffect, useMemo, useState } from "react";
import { getCurrentUser, type AuthUser } from "../lib/auth-client";
import { ThemeToggle } from "../components/ThemeToggle";

type ToolResult<T> = {
  ok: boolean;
  data: T;
  updatedAt: string;
  source: string;
  error?: string;
};

type DashboardData = {
  ok: boolean;
  generatedAt: string;
  currentDate: {
    iso: string;
    label: string;
  };
  weather: ToolResult<{
    city: string;
    temperatureC: number | null;
    windKmh: number | null;
    humidityPercent: number | null;
    description: string;
  }>;
  rates: Array<
    ToolResult<{
      code: "EUR" | "USD" | "GBP";
      rate: number | null;
      date: string;
    }>
  >;
  holidays: ToolResult<
    Array<{
      name: string;
      localName: string;
      date: string;
      daysLeft: number;
    }>
  >;
};

const quickActions = [
  {
    href: "/agent",
    icon: "🤖",
    label: "Agent pełna moc",
    description: "Autonomiczny agent z narzędziami, wyszukiwaniem, grafiką i bazą wiedzy.",
  },
  {
    href: "/offer",
    icon: "📄",
    label: "Generator oferty AI",
    description: "Nowy scenariusz W4: diagnoza klienta, zakres MVP, wycena i gotowy e-mail.",
  },
  {
    href: "/bariatric",
    icon: "🥗",
    label: "BariCare AI",
    description: "Asystent pacjenta przed i po operacji bariatrycznej: pytania, dzienniczek i raport.",
  },
  {
    href: "/wash",
    icon: "🧼",
    label: "Agent marketingowy myjni",
    description: "Panel dla właściciela: posty, kampanie, e-mail i decyzje sprzedażowe.",
  },
  {
    href: "/wash-booking",
    icon: "📅",
    label: "Agent rezerwacji myjni",
    description: "Obsługa klienta: dobór usługi, czas, widełki ceny i wolne terminy.",
  },
  {
    href: "/travel",
    icon: "🧳",
    label: "Zaplanuj podróż",
    description: "Pogoda, waluty, święta i rekomendacja wyjazdu.",
  },
  {
    href: "/react",
    icon: "⚙️",
    label: "Agent ReAct",
    description: "Agent, który używa narzędzi krok po kroku.",
  },
  {
    href: "/chat",
    icon: "💬",
    label: "Chat z Vie",
    description: "Główna rozmowa z Twoją personą AI.",
  },
  {
    href: "/think",
    icon: "🧠",
    label: "Tryb myślenia",
    description: "Analiza problemu i logiczne rozbijanie zadań.",
  },
  {
    href: "/generate",
    icon: "🎨",
    label: "Generator grafik",
    description: "Tworzenie testowych grafik z promptu.",
  },
  {
    href: "/upload",
    icon: "📚",
    label: "Baza wiedzy",
    description: "Wklej dokumenty, cenniki i FAQ do Supabase RAG.",
  },
  {
    href: "/knowledge",
    icon: "🔎",
    label: "Podgląd wiedzy",
    description: "Sprawdź fragmenty, źródła i testowe wyszukiwanie RAG.",
  },
  {
    href: "/fewshot",
    icon: "🧩",
    label: "Słownik AI",
    description: "Przykłady stylu, tonu i gotowych formatów.",
  },
];

const travelBudgetPreview = {
  destination: "Berlin",
  people: 2,
  days: 3,
  style: "Standard",
  totalPln: 4738,
  perPersonPln: 2369,
  reservePln: 618,
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    currency: "PLN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatTime(iso?: string) {
  if (!iso) return "—";

  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));
}

function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="dashboard-skeleton-list" aria-label="Ładowanie danych">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="dashboard-skeleton" />
      ))}
    </div>
  );
}

const landingFeatures = [
  { icon: "🧠", title: "Pamięta Twoje rozmowy", description: "Wracaj do tematów bez powtarzania kontekstu. Vie porządkuje historię i kontynuuje tam, gdzie skończyliście." },
  { icon: "📚", title: "Zna dokumenty Twojej firmy", description: "Cenniki, procedury i FAQ stają się prywatną bazą wiedzy, z której agent przygotowuje konkretne odpowiedzi." },
  { icon: "🔐", title: "Prywatne dane per user", description: "Każde konto ma oddzielne rozmowy, dokumenty i profil. Twoja wiedza zostaje przypisana wyłącznie do Ciebie." },
  { icon: "⚡", title: "Pracuje 24/7", description: "Automatyczne briefingi i zadania cykliczne działają także wtedy, gdy nie masz otwartej aplikacji." },
];

function LandingPage() {
  return (
    <main className="landing-shell">
      <div className="landing-orb landing-orb-one" aria-hidden="true" />
      <div className="landing-orb landing-orb-two" aria-hidden="true" />
      <nav className="landing-nav" aria-label="Nawigacja strony głównej">
        <Link className="landing-brand" href="/" aria-label="Vie AI — strona główna"><Image className="landing-brand-logo" src="/vie-logo.png" alt="" width={52} height={52} priority /><strong>Vie AI</strong></Link>
        <div className="landing-nav-actions"><ThemeToggle compact /><Link className="landing-nav-link" href="/login">Zaloguj się</Link></div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-official-logo">
            <Image src="/vie-logo.png" alt="Logo Vie AI Agent" width={190} height={190} priority />
          </div>
          <p className="landing-kicker"><span /> Twój inteligentny copilot</p>
          <h1>Agent AI, który zna <em>Twój biznes.</em></h1>
          <p className="landing-lead">Vie łączy rozmowy, firmową wiedzę i automatyzacje w jednym bezpiecznym miejscu — żeby szybciej zamieniać pytania w decyzje.</p>
          <div className="landing-actions">
            <Link className="landing-primary" href="/login"><span>🚀</span> Zacznij za darmo</Link>
            <a className="landing-secondary" href="#demo">Zobacz, jak działa <span>↓</span></a>
          </div>
          <div className="landing-proof"><span>✓ Bez karty</span><span>✓ Start w 30 sekund</span><span>✓ Prywatna przestrzeń</span></div>
        </div>

        <div className="landing-hero-visual" aria-label="Podgląd interfejsu Vie AI">
          <div className="landing-window-glow" />
          <div className="landing-app-window">
            <header><div className="landing-window-dots"><i /><i /><i /></div><span>Vie AI</span><b>● Online</b></header>
            <div className="landing-app-body">
              <aside><div className="landing-mini-brand">V</div><span className="active">✦</span><span>⌁</span><span>▤</span><span>⚙</span></aside>
              <section className="landing-conversation">
                <div className="landing-chat-heading"><small>NOWA ROZMOWA</small><strong>Jak mogę Ci pomóc?</strong></div>
                <div className="landing-message user-message">Jaki jest aktualny cennik pakietu Premium?</div>
                <div className="landing-message ai-message"><div className="landing-avatar">V</div><div><strong>Vie AI</strong><p>Pakiet Premium kosztuje <b>499 zł miesięcznie</b>. Obejmuje pełną bazę wiedzy, automatyczne briefingi i nielimitowane rozmowy.</p><small>Źródło: Cennik_2026.pdf · strona 3</small></div></div>
                <div className="landing-input"><span>Zadaj kolejne pytanie…</span><b>↑</b></div>
              </section>
            </div>
          </div>
          <div className="landing-float-card landing-float-memory"><span>🧠</span><div><b>Pamięć aktywna</b><small>12 rozmów w kontekście</small></div></div>
          <div className="landing-float-card landing-float-source"><span>✓</span><div><b>Źródło znalezione</b><small>Odpowiedź z Twoich danych</small></div></div>
        </div>
      </section>

      <section className="landing-features" aria-labelledby="features-title">
        <div className="landing-section-heading"><p>WIĘCEJ NIŻ CHATBOT</p><h2 id="features-title">Twoja wiedza. Twój kontekst.<br /><span className="landing-agent-line">Twój agent.</span></h2></div>
        <div className="landing-feature-grid">
          {landingFeatures.map((feature, index) => (
            <article key={feature.title} style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}>
              <span className="landing-feature-icon">{feature.icon}</span><h3>{feature.title}</h3><p>{feature.description}</p><i aria-hidden="true">0{index + 1}</i>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-demo" id="demo">
        <div className="landing-demo-copy">
          <p className="landing-kicker"><span /> Odpowiedzi oparte na faktach</p>
          <h2>Zapytaj o cennik.<br />Vie odpowie z <em>Twoich dokumentów.</em></h2>
          <p>Każda odpowiedź wskazuje źródło, więc wiesz nie tylko <b>co</b> mówi agent, ale także <b>skąd</b> to wie.</p>
          <ul><li><span>✓</span> Wyszukiwanie semantyczne w bazie wiedzy</li><li><span>✓</span> Cytowanie dokumentu i konkretnej strony</li><li><span>✓</span> Odpowiedzi w Twoim stylu i tonie marki</li></ul>
        </div>
        <div className="landing-document-card">
          <div className="landing-document-top"><span>PDF</span><div><strong>Cennik_2026.pdf</strong><small>Zaindeksowano 2 min temu</small></div><b>•••</b></div>
          <div className="landing-document-lines"><i /><i /><i /><i /><i /></div>
          <div className="landing-document-highlight"><span>PAKIET PREMIUM</span><strong>499 zł / miesiąc</strong><small>Pełna baza wiedzy · Briefingi · Bez limitu</small></div>
          <div className="landing-document-match"><span>✦</span><div><strong>98% dopasowania</strong><small>Fragment użyty w odpowiedzi agenta</small></div></div>
        </div>
      </section>

      <section className="landing-final-cta">
        <div className="landing-final-glow" aria-hidden="true" /><p>GOTOWY NA WŁASNEGO AGENTA?</p><h2>Zacznij w 30 sekund.</h2>
        <span>Dodaj pierwsze dokumenty i porozmawiaj z agentem, który naprawdę zna Twój biznes.</span>
        <Link className="landing-primary" href="/login">Stwórz konto <b>→</b></Link>
      </section>

      <footer className="landing-footer"><Link className="landing-brand" href="/"><Image className="landing-brand-logo" src="/vie-logo.png" alt="" width={52} height={52} /><strong>Vie AI</strong></Link><div className="landing-footer-center"><p>Twój biznes. Twoja wiedza. Twój agent.</p><nav aria-label="Dokumenty prawne"><Link href="/regulamin">Regulamin</Link><Link href="/polityka-prywatnosci">Prywatność</Link><Link href="/polityka-cookies">Cookies</Link></nav></div><small>© 2026 Vie AI</small></footer>
    </main>
  );
}

export default function DashboardPage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void getCurrentUser().then((currentUser) => {
      if (active) {
        setAuthUser(currentUser);
        setAuthChecking(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function loadDashboard(showSpinner = false) {
    if (showSpinner) setRefreshing(true);
    setError("");

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Błąd serwera: ${response.status}`);
      }
      const json = (await response.json()) as DashboardData;
      setData(json);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nie udało się pobrać danych dashboardu.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!authUser) return;
    loadDashboard();

    const weatherTimer = window.setInterval(() => loadDashboard(), 15 * 60_000);
    const ratesTimer = window.setInterval(() => loadDashboard(), 60 * 60_000);

    return () => {
      window.clearInterval(weatherTimer);
      window.clearInterval(ratesTimer);
    };
  }, [authUser]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Dzień dobry";
    if (hour < 18) return "Dobrego popołudnia";
    return "Dobry wieczór";
  }, []);

  if (authChecking) {
    return <main className="landing-loading"><span>V</span></main>;
  }

  if (!authUser) {
    return <LandingPage />;
  }

  return (
    <main className="dashboard-shell">
      <button
        className="dashboard-mobile-toggle"
        type="button"
        aria-label="Otwórz menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        ☰
      </button>

      <aside className={`dashboard-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="dashboard-brand">
          <Image className="dashboard-brand-logo" src="/vie-logo.png" alt="Logo Vie AI Agent" width={78} height={78} priority />
          <div>
            <strong>Vie AI Agent</strong>
            <small>panel pracy</small>
          </div>
        </div>

        <AppNav active="/" />
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">Lekcja 4 · Dashboard</p>
            <h1>
              {greeting}!{" "}
              <span>{data?.currentDate.label ?? "Ładuję aktualne dane..."}</span>
            </h1>
          </div>

          <button
            className="dashboard-refresh"
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
          >
            <span className={refreshing ? "spin" : ""}>↻</span>
            {refreshing ? "Odświeżam" : "Odśwież"}
          </button>
        </header>

        {error ? (
          <div className="dashboard-error" role="alert">
            Nie udało się pobrać części danych: {error}
          </div>
        ) : null}

        <section className="dashboard-grid" aria-label="Dane operacyjne">
          <article className="dashboard-card dashboard-card-weather">
            <div className="dashboard-card-head">
              <span aria-hidden="true">🌦️</span>
              <div>
                <h2>Pogoda</h2>
                <p>Warszawa · odświeżanie co 15 minut</p>
              </div>
            </div>

            {loading || !data ? (
              <SkeletonLines />
            ) : (
              <>
                <div className="dashboard-big-value">
                  {data.weather.data.temperatureC ?? "—"}°C
                </div>
                <p className="dashboard-muted">{data.weather.data.description}</p>
                <div className="dashboard-metrics">
                  <span>Wiatr: {data.weather.data.windKmh ?? "—"} km/h</span>
                  <span>
                    Wilgotność: {data.weather.data.humidityPercent ?? "—"}%
                  </span>
                </div>
                <footer>
                  Źródło: {data.weather.source} · aktualizacja{" "}
                  {formatTime(data.weather.updatedAt)}
                </footer>
              </>
            )}
          </article>

          <article className="dashboard-card dashboard-card-rates">
            <div className="dashboard-card-head">
              <span aria-hidden="true">💱</span>
              <div>
                <h2>Kursy walut</h2>
                <p>EUR, USD i GBP · odświeżanie co godzinę</p>
              </div>
            </div>

            {loading || !data ? (
              <SkeletonLines />
            ) : (
              <>
                <div className="dashboard-rate-list">
                  {data.rates.map((rate) => (
                    <div key={rate.data.code}>
                      <strong>{rate.data.code}</strong>
                      <span>
                        {rate.data.rate?.toFixed(4) ?? "—"} PLN
                      </span>
                      <small>{rate.data.date}</small>
                    </div>
                  ))}
                </div>
                <footer>
                  Źródło: {data.rates.map((rate) => rate.source).join(", ")} ·{" "}
                  aktualizacja {formatTime(data.rates[0]?.updatedAt)}
                </footer>
              </>
            )}
          </article>

          <article className="dashboard-card dashboard-card-holidays">
            <div className="dashboard-card-head">
              <span aria-hidden="true">🗓️</span>
              <div>
                <h2>Najbliższe święta</h2>
                <p>Polska · rok 2026</p>
              </div>
            </div>

            {loading || !data ? (
              <SkeletonLines count={4} />
            ) : data.holidays.data.length ? (
              <>
                <div className="dashboard-holiday-list">
                  {data.holidays.data.map((holiday) => (
                    <div key={holiday.date}>
                      <strong>{holiday.localName}</strong>
                      <span>{holiday.date}</span>
                      <small>
                        {holiday.daysLeft === 0
                          ? "dzisiaj"
                          : `za ${holiday.daysLeft} dni`}
                      </small>
                    </div>
                  ))}
                </div>
                <footer>
                  Źródło: {data.holidays.source} · aktualizacja{" "}
                  {formatTime(data.holidays.updatedAt)}
                </footer>
              </>
            ) : (
              <p className="dashboard-muted">Brak kolejnych świąt w danych.</p>
            )}
          </article>

          <article className="dashboard-card dashboard-card-budget">
            <div className="dashboard-card-head">
              <span aria-hidden="true">💼</span>
              <div>
                <h2>Budżet podróży</h2>
                <p>Nowa funkcja asystenta podróży</p>
              </div>
            </div>

            <div className="dashboard-budget-main">
              <strong>{formatMoney(travelBudgetPreview.totalPln)}</strong>
              <span>
                {travelBudgetPreview.destination} · {travelBudgetPreview.people} osoby ·{" "}
                {travelBudgetPreview.days} dni · {travelBudgetPreview.style}
              </span>
            </div>

            <div className="dashboard-metrics">
              <span>Na osobę: {formatMoney(travelBudgetPreview.perPersonPln)}</span>
              <span>Rezerwa: {formatMoney(travelBudgetPreview.reservePln)}</span>
            </div>

            <p className="dashboard-muted">
              Karta pokazuje szybki koszt wyjazdu, a pełny panel pozwala zmienić liczbę osób,
              liczbę dni, transport i poziom komfortu.
            </p>

            <Link className="dashboard-card-link" href="/travel">
              Otwórz asystenta budżetu
            </Link>
          </article>

          <article className="dashboard-card dashboard-card-actions">
            <div className="dashboard-card-head">
              <span aria-hidden="true">⚡</span>
              <div>
                <h2>Szybkie akcje</h2>
                <p>Przejdź do gotowych modułów agenta</p>
              </div>
            </div>

            <div className="dashboard-action-grid">
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <span>{action.icon}</span>
                  <strong>{action.label}</strong>
                  <small>{action.description}</small>
                </Link>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

