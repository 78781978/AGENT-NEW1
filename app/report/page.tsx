"use client";

import { AppNav } from "../../components/AppNav";
import { Fragment, useState } from "react";

const reportExamples = [
  "Rynek AI w Polsce - trendy, firmy, prognozy na 2026",
  "Porównanie platform e-commerce: Shopify vs WooCommerce vs PrestaShop",
  "Wpływ pracy zdalnej na produktywność - badania i statystyki",
  "Rynek nieruchomości w Krakowie - ceny, trendy, prognozy",
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
                {header.map((cell) => (
                  <th key={cell}>{renderInline(cell)}</th>
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
          {items.map((item) => (
            <li key={item}>{renderInline(item)}</li>
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
          {items.map((item) => (
            <li key={item}>{renderInline(item)}</li>
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

export default function ReportPage() {
  const [topic, setTopic] = useState(reportExamples[0]);
  const [report, setReport] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateReport() {
    const trimmed = topic.trim();

    if (!trimmed || isLoading) {
      return;
    }

    setReport("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ topic: trimmed }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Generator raportów nie zwrócił odpowiedzi.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setReport((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Nie udało się wygenerować raportu.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyReport() {
    await navigator.clipboard.writeText(report);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Generator raportów">
        <AppNav active="/report" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 8 - Warsztat 2</p>
            <h1>📊 Generator raportów</h1>
            <p className="subtitle">
              Opisz temat, a agent przygotuje raport biznesowy z sekcjami, analizą i wnioskami.
            </p>
            <div className="sample-questions" aria-label="Przykładowe raporty">
              {reportExamples.map((example) => (
                <button disabled={isLoading} key={example} type="button" onClick={() => setTopic(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
          <div className="model-pill expert">raport</div>
        </header>

        <form
          className="report-form"
          onSubmit={(event) => {
            event.preventDefault();
            generateReport();
          }}
        >
          <label className="report-label" htmlFor="report-topic">
            O czym ma być raport?
          </label>
          <div className="report-controls">
            <input
              className="report-input"
              id="report-topic"
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Np. Rynek AI w Polsce w 2026 roku..."
              value={topic}
            />
            <button className="report-button" type="submit" disabled={isLoading || !topic.trim()}>
              {isLoading ? "📊 Generuję..." : "📊 Generuj raport"}
            </button>
          </div>
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
          {!report && !isLoading && (
            <div className="empty-state">
              <p>
                Wpisz temat raportu. Agent przygotuje streszczenie, dane, analizę, rekomendacje i
                źródła.
              </p>
            </div>
          )}

          {(report || isLoading) && (
            <>
              <div className="report-actions">
                <span>{isLoading ? "Agent zbiera dane i pisze raport..." : "Raport gotowy"}</span>
                <button type="button" onClick={copyReport} disabled={!report}>
                  📋 Kopiuj do schowka
                </button>
              </div>
              <article className="markdown-content report-document">
                {report ? renderMarkdown(report) : <p>Przygotowuję raport...</p>}
              </article>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
