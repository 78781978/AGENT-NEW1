"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AppNav } from "../../components/AppNav";

type Briefing = {
  id: string;
  created_at: string;
  content: string;
  date?: string;
  metadata?: Record<string, unknown>;
};

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

function stripMarkdown(text: string) {
  return text
    .replace(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/[#*_>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBriefingDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => briefings.find((briefing) => briefing.id === selectedId) ?? null,
    [briefings, selectedId],
  );

  async function loadBriefings() {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/briefings", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; briefings?: Briefing[]; error?: string }
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Nie udało się pobrać briefingów.");
      }

      setBriefings(data.briefings ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nie udało się pobrać briefingów.");
    } finally {
      setIsLoading(false);
    }
  }

  async function generateNow() {
    if (isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/cron/morning", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Nie udało się wygenerować briefingu.");
      }

      await loadBriefings();
      setSelectedId(null);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Nie udało się wygenerować briefingu.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copySelected() {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  useEffect(() => {
    loadBriefings();
  }, []);

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Briefingi">
        <AppNav active="/briefings" />

        <header className="chat-header briefings-header">
          <div>
            <p className="eyebrow">LEKCJA 10 - WARSZTAT 4</p>
            <h1>📰 Briefingi</h1>
            <p className="subtitle">Automatyczne podsumowania dnia od Twojego agenta.</p>
          </div>
          <button className="briefing-primary" disabled={isGenerating} type="button" onClick={generateNow}>
            {isGenerating ? "🔄 Generuję..." : "🔄 Wygeneruj teraz"}
          </button>
        </header>

        {error && (
          <div className="error-box">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>
              Zamknij
            </button>
          </div>
        )}

        {!selected && (
          <section className="briefings-list" aria-live="polite">
            {isLoading && (
              <div className="empty-state">
                <p>Ładuję briefingi...</p>
              </div>
            )}

            {!isLoading && briefings.length === 0 && (
              <div className="empty-state">
                <p>Brak briefingów. Cron job wygeneruje pierwszy jutro rano!</p>
                <button className="briefing-primary" disabled={isGenerating} type="button" onClick={generateNow}>
                  {isGenerating ? "🔄 Generuję..." : "🔄 Wygeneruj teraz"}
                </button>
              </div>
            )}

            {!isLoading &&
              briefings.map((briefing) => {
                const preview = stripMarkdown(briefing.content).slice(0, 150);

                return (
                  <button
                    className="briefing-card"
                    key={briefing.id}
                    type="button"
                    onClick={() => setSelectedId(briefing.id)}
                  >
                    <span className="briefing-date">{formatBriefingDate(briefing.created_at)}</span>
                    <strong>✅ wygenerowany automatycznie</strong>
                    <p>
                      {preview}
                      {preview.length >= 150 ? "..." : ""}
                    </p>
                  </button>
                );
              })}
          </section>
        )}

        {selected && (
          <section className="briefing-detail">
            <div className="briefing-detail-actions">
              <button type="button" onClick={() => setSelectedId(null)}>
                ← Wróć do listy
              </button>
              <button type="button" onClick={copySelected}>
                {copied ? "✅ Skopiowano" : "📋 Kopiuj"}
              </button>
            </div>
            <p className="briefing-date">{formatBriefingDate(selected.created_at)}</p>
            <article className="markdown-content report-document">{renderMarkdown(selected.content)}</article>
          </section>
        )}
      </section>
    </main>
  );
}
