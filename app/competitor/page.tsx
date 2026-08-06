"use client";

import { AppNav } from "../../components/AppNav";
import { Fragment, useState } from "react";

const examples = [
  {
    label: "Shopify vs WooCommerce vs PrestaShop",
    companies: ["Shopify", "WooCommerce", "PrestaShop"],
    context: "Szukam platformy e-commerce dla malego sklepu internetowego.",
  },
  {
    label: "Notion vs Obsidian vs Evernote",
    companies: ["Notion", "Obsidian", "Evernote"],
    context: "Szukam narzedzia do notatek i organizacji wiedzy dla malej firmy.",
  },
  {
    label: "Vercel vs Netlify vs Railway",
    companies: ["Vercel", "Netlify", "Railway"],
    context: "Szukam hostingu dla aplikacji Next.js i prostego produktu SaaS.",
  },
  {
    label: "ChatGPT vs Claude vs Gemini",
    companies: ["ChatGPT", "Claude", "Gemini"],
    context: "Szukam asystenta AI do pracy biznesowej, analizy i automatyzacji.",
  },
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

export default function CompetitorPage() {
  const [companies, setCompanies] = useState(["Shopify", "WooCommerce", "PrestaShop"]);
  const [context, setContext] = useState("Szukam platformy e-commerce dla malego sklepu internetowego.");
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateCompany(index: number, value: string) {
    setCompanies((current) => current.map((company, companyIndex) => (companyIndex === index ? value : company)));
  }

  function applyExample(example: (typeof examples)[number]) {
    setCompanies(example.companies);
    setContext(example.context);
    setResult("");
    setError(null);
  }

  async function compareCompanies() {
    const cleanCompanies = companies.map((company) => company.trim());

    if (cleanCompanies.some((company) => !company) || isLoading) {
      setError("Wpisz trzy firmy do porownania.");
      return;
    }

    setResult("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/competitor", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ companies: cleanCompanies, context: context.trim() }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Agent konkurencji nie zwrocil odpowiedzi.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setResult((current) => current + decoder.decode(value, { stream: true }));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Nie udalo sie wykonac analizy.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyAnalysis() {
    await navigator.clipboard.writeText(result);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Analiza konkurencji">
        <AppNav active="/competitor" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 8 - Warsztat 3</p>
            <h1>Analiza konkurencji</h1>
            <p className="subtitle">Podaj firmy - agent porowna je za Ciebie.</p>
            <div className="sample-questions" aria-label="Przykladowe analizy konkurencji">
              {examples.map((example) => (
                <button disabled={isLoading} key={example.label} type="button" onClick={() => applyExample(example)}>
                  {example.label}
                </button>
              ))}
            </div>
          </div>
          <div className="model-pill expert">konkurencja</div>
        </header>

        <form
          className="competitor-form"
          onSubmit={(event) => {
            event.preventDefault();
            compareCompanies();
          }}
        >
          <div className="competitor-input-grid">
            {companies.map((company, index) => (
              <label key={`company-${index}`}>
                Firma {index + 1}
                <input
                  onChange={(event) => updateCompany(index, event.target.value)}
                  placeholder={index === 0 ? "Np. Shopify" : index === 1 ? "Np. WooCommerce" : "Np. PrestaShop"}
                  value={company}
                />
              </label>
            ))}
          </div>

          <label className="competitor-context">
            Kontekst
            <textarea
              onChange={(event) => setContext(event.target.value)}
              placeholder="Np. Szukam platformy e-commerce dla malego sklepu"
              rows={4}
              value={context}
            />
          </label>

          <button className="report-button" type="submit" disabled={isLoading || companies.some((company) => !company.trim())}>
            {isLoading ? "Porownuje..." : "Porownaj"}
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
          {!result && !isLoading && (
            <div className="empty-state">
              <p>Wpisz trzy firmy. Agent przygotuje tabele, szczegolowa analize, rekomendacje i zrodla.</p>
            </div>
          )}

          {(result || isLoading) && (
            <>
              <div className="report-actions">
                <span>{isLoading ? "Agent zbiera informacje i porownuje firmy..." : "Analiza gotowa"}</span>
                <button type="button" onClick={copyAnalysis} disabled={!result}>
                  Kopiuj analize
                </button>
              </div>
              <article className="markdown-content report-document competitor-document">
                {result ? renderMarkdown(result) : <p>Przygotowuje analize konkurencji...</p>}
              </article>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
