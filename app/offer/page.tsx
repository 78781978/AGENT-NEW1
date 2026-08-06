"use client";

import { AppNav } from "../../components/AppNav";
import { Fragment, useState } from "react";

const offerExamples = [
  "Mały sklep WooCommerce traci dużo czasu na pytania o status zamówienia, dostawę, zwroty i dostępność produktów. Klient chce asystenta AI oraz automatyzację odpowiedzi.",
  "Lokalna firma usługowa dostaje zapytania z formularza, Facebooka i maila. Potrzebuje uporządkować leady, przygotowywać odpowiedzi i przypomnienia follow-up.",
  "Hurtownia chce szybciej tworzyć oferty PDF, sprawdzać ceny, generować odpowiedzi do klientów B2B i mieć prosty raport sprzedażowy.",
];

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);

  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);

    if (link) {
      return (
        <a href={link[2]} key={`${part}-${index}`} rel="noreferrer" target="_blank">
          {link[1]}
        </a>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("|") && lines[index + 1] && isTableSeparator(lines[index + 1])) {
      const header = parseTableRow(line);
      index += 2;
      const rows: string[][] = [];

      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }

      blocks.push(
        <div className="markdown-table-wrap" key={`table-${index}`}>
          <table>
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={`${cell}-${cellIndex}`}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${row.join("-")}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${cell}-${cellIndex}`}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 2;
      const content = line.replace(/^#{1,3}\s/, "");
      const Heading = level === 1 ? "h2" : "h3";
      blocks.push(<Heading key={`heading-${index}`}>{renderInline(content)}</Heading>);
      index += 1;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s/, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^[-*]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraph: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith("|") &&
      !/^#{1,3}\s/.test(lines[index].trim()) &&
      !/^\d+\.\s/.test(lines[index].trim()) &&
      !/^[-*]\s/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(" "))}</p>);
  }

  return blocks;
}

export default function OfferPage() {
  const [brief, setBrief] = useState(offerExamples[0]);
  const [offer, setOffer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateOffer() {
    const trimmed = brief.trim();

    if (!trimmed || isLoading) {
      return;
    }

    setOffer("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/offer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ brief: trimmed }),
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || "Agent ofert nie zwrócił odpowiedzi.");
      }

      if (!text.trim()) {
        throw new Error("Agent zwrócił pustą odpowiedź. Spróbuj ponownie krótszym opisem klienta.");
      }

      setOffer(text);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Nie udało się wygenerować oferty.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyOffer() {
    await navigator.clipboard.writeText(offer);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Generator oferty AI">
        <AppNav active="/offer" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 8 - Warsztat 4</p>
            <h1>Generator oferty AI</h1>
            <p className="subtitle">
              Wklej opis klienta. Agent przygotuje diagnozę, zakres MVP, etapy, wycenę i gotowy e-mail.
            </p>
            <div className="sample-questions" aria-label="Przykładowe scenariusze oferty">
              {offerExamples.map((example, index) => (
                <button disabled={isLoading} key={example} type="button" onClick={() => setBrief(example)}>
                  Przykład {index + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="model-pill expert">oferta</div>
        </header>

        <form
          className="competitor-form"
          onSubmit={(event) => {
            event.preventDefault();
            generateOffer();
          }}
        >
          <label className="competitor-context">
            Opis klienta lub procesu
            <textarea
              onChange={(event) => setBrief(event.target.value)}
              placeholder="Np. Klient ma sklep WooCommerce i chce automatyzować pytania o zamówienia..."
              rows={6}
              value={brief}
            />
          </label>

          <button className="report-button" type="submit" disabled={isLoading || !brief.trim()}>
            {isLoading ? "Tworzę ofertę..." : "Wygeneruj ofertę"}
          </button>
        </form>

        {error && (
          <div className="error-box">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>
              Zamknij
            </button>
          </div>
        )}

        <section className="report-output" aria-live="polite">
          {!offer && !isLoading && (
            <div className="empty-state">
              <p>
                Wpisz realny opis klienta. Agent przygotuje ofertę, którą możesz wkleić do maila lub omówić
                podczas rozmowy handlowej.
              </p>
            </div>
          )}

          {(offer || isLoading) && (
            <>
              <div className="report-actions">
                <span>{isLoading ? "Agent analizuje potrzeby i liczy zakres..." : "Oferta gotowa"}</span>
                <button type="button" onClick={copyOffer} disabled={!offer}>
                  Kopiuj ofertę
                </button>
              </div>
              <article className="markdown-content report-document competitor-document">
                {offer ? renderMarkdown(offer) : <p>Przygotowuję ofertę...</p>}
              </article>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
