"use client";

import { AppNav } from "../../components/AppNav";
import { Fragment, useMemo, useState } from "react";

const sampleEmails = `Mail 1 - PILNY:
Od: jan.kowalski@firma.pl
Temat: PILNE - Problem z fakturą
Treść: Dzień dobry, mam problem z fakturą FV/2026/001. Kwota jest nieprawidłowa - powinno być 5000 zł, a jest 3000 zł. Proszę o pilną korektę. Termin płatności mija jutro.

Mail 2 - SPAM:
Od: winner@lucky-prize.com
Temat: Congratulations! You won $1,000,000
Treść: Click here to claim your prize! Limited time offer. Act now!

Mail 3 - OFERTA:
Od: anna.nowak@partner.pl
Temat: Propozycja współpracy
Treść: Dzień dobry, reprezentuję firmę ABC Solutions. Chcielibyśmy omówić możliwość współpracy w zakresie dostarczania usług IT. Czy możemy umówić się na spotkanie w przyszłym tygodniu?

Mail 4 - REKLAMACJA:
Od: klient123@gmail.com
Temat: Nie działa usługa od 3 dni
Treść: Witam, od poniedziałku nie mogę się zalogować do panelu klienta. Próbowałem resetować hasło, ale nie dostaję maila. To już trzeci dzień! Jeśli nie rozwiążecie tego dziś, zrezygnuję z usługi.

Mail 5 - INFO:
Od: newsletter@branzowy-portal.pl
Temat: Nowe trendy AI w biznesie - raport 2026
Treść: Zapraszamy do lektury naszego najnowszego raportu o zastosowaniach AI w polskich firmach. Pobierz za darmo na naszej stronie.`;

type ParsedMail = {
  title: string;
  category: string;
  priority: string;
  reason: string;
  draft: string;
};

function splitEmails(value: string) {
  return value
    .split(/\n\s*\n(?=Mail\s+\d+|Od:|Temat:)/i)
    .map((mail) => mail.trim())
    .filter(Boolean);
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function renderRawMarkdown(text: string) {
  return text.split("\n").map((line, index) => (
    <Fragment key={`${line}-${index}`}>
      {renderInline(line)}
      {index < text.split("\n").length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function extractField(block: string, field: string) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`\\|\\s*${escaped}\\s*\\|\\s*([^|]+)\\|`, "i"));
  return match?.[1]?.trim() || "";
}

function parseTriageResult(text: string): ParsedMail[] {
  if (!text.trim()) {
    return [];
  }

  return text
    .split(/\n---+\n/)
    .map((block) => block.trim())
    .filter((block) => /^###\s+Mail/i.test(block))
    .map((block, index) => {
      const title = block.match(/^###\s+(.+)$/m)?.[1]?.trim() || `Mail ${index + 1}`;
      const draft =
        block.match(/\*\*Proponowana odpowiedź:\*\*\s*\n>\s*([\s\S]+)/i)?.[1]?.trim() ||
        block.match(/\*\*Draft:\*\*\s*\n>\s*([\s\S]+)/i)?.[1]?.trim() ||
        "";

      return {
        title,
        category: extractField(block, "Kategoria"),
        priority: extractField(block, "Priorytet"),
        reason: extractField(block, "Uzasadnienie"),
        draft: draft.replace(/\n---[\s\S]*$/g, "").trim(),
      };
    });
}

function parseSummary(text: string) {
  const count = (pattern: RegExp) => text.match(pattern)?.length || 0;

  return {
    urgent: count(/Wysoki|Pilne|🔴/gi),
    medium: count(/Średni|Średnie|🟡/gi),
    low: count(/Niski|Niskie|🟢/gi),
    spam: count(/Spam|🗑️/gi),
  };
}

function getPriorityClass(priority: string) {
  const normalized = priority.toLowerCase();

  if (normalized.includes("wysoki") || normalized.includes("pilne")) return "urgent";
  if (normalized.includes("średni")) return "medium";
  if (normalized.includes("spam")) return "spam";
  return "low";
}

export default function EmailTriagePage() {
  const [input, setInput] = useState(sampleEmails);
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsedMails = useMemo(() => parseTriageResult(result), [result]);
  const summary = useMemo(() => parseSummary(result), [result]);

  async function handleAnalyze() {
    const emails = splitEmails(input);

    if (emails.length === 0 || isLoading) {
      return;
    }

    setResult("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/email-triage", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ emails }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Agent nie zwrócił analizy maili.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setResult((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udało się połączyć z agentem e-mail triage.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyDraft(draft: string) {
    await navigator.clipboard.writeText(draft);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="E-mail Triage">
        <AppNav active="/email-triage" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 8 - Warsztat 1</p>
            <h1>📧 E-mail Triage</h1>
            <p className="subtitle">
              Wklej maile. Agent posortuje je, nada priorytety i napisze szkice odpowiedzi.
            </p>
          </div>
          <div className="model-pill expert">triage</div>
        </header>

        <section className="email-triage-grid">
          <div className="email-input-panel">
            <div className="email-panel-header">
              <strong>Maile do analizy</strong>
              <button type="button" onClick={() => setInput(sampleEmails)} disabled={isLoading}>
                📋 Wklej przykład
              </button>
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Wklej maile tutaj - oddziel je pustą linią..."
              rows={12}
            />
            <button className="primary-action" type="button" onClick={handleAnalyze} disabled={isLoading}>
              {isLoading ? "📧 Analizuję..." : "📧 Analizuj maile"}
            </button>
          </div>

          <div className="email-results-panel">
            {!result && !isLoading && (
              <div className="empty-state">
                <p>
                  Wynik pojawi się tutaj. Każdy mail dostanie kategorię, priorytet i gotowy draft
                  odpowiedzi.
                </p>
              </div>
            )}

            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}

            {(result || isLoading) && (
              <>
                <div className="triage-summary">
                  <span className="urgent">🔴 {summary.urgent} pilne</span>
                  <span className="medium">🟡 {summary.medium} średnie</span>
                  <span className="low">🟢 {summary.low} niskie</span>
                  <span className="spam">🗑️ {summary.spam} spam</span>
                </div>

                {parsedMails.length > 0 ? (
                  <div className="triage-cards">
                    {parsedMails.map((mail) => (
                      <article className={`triage-card ${getPriorityClass(mail.priority)}`} key={mail.title}>
                        <div className="triage-card-header">
                          <h2>{mail.title}</h2>
                          <span>{mail.priority || "Priorytet"}</span>
                        </div>
                        <dl>
                          <div>
                            <dt>Kategoria</dt>
                            <dd>{mail.category || "Do ustalenia"}</dd>
                          </div>
                          <div>
                            <dt>Uzasadnienie</dt>
                            <dd>{mail.reason || "Brak uzasadnienia"}</dd>
                          </div>
                        </dl>
                        <blockquote>{mail.draft || "Draft pojawi się po zakończeniu analizy."}</blockquote>
                        {mail.draft && (
                          <button type="button" onClick={() => copyDraft(mail.draft)}>
                            Kopiuj draft
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="bubble markdown-content">{renderRawMarkdown(result || "Agent analizuje maile...")}</div>
                )}
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
