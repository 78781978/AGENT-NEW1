"use client";

import { AppNav } from "../../components/AppNav";
import { Fragment, useState } from "react";

const stageOptions = [
  "Przed operacją - przygotowanie do konsultacji",
  "Po operacji - etap płynny",
  "Po operacji - etap papkowaty",
  "Po operacji - etap miękki",
  "Po operacji - powrót do stałych posiłków",
  "Długoterminowa opieka po operacji",
];

const goalExamples = [
  "Przygotuj listę pytań do chirurga i dietetyka przed operacją.",
  "Zrób dzienniczek posiłków, płynów i objawów na dzisiejszy dzień.",
  "Pomóż mi sprawdzić nawodnienie i białko po operacji, bez podawania dawek.",
  "Przygotuj raport dla dietetyka na wizytę kontrolną.",
  "Wyjaśnij, jakie objawy po operacji powinny wymagać pilnego kontaktu z lekarzem.",
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

export default function BariatricPage() {
  const [stage, setStage] = useState(stageOptions[0]);
  const [goal, setGoal] = useState(goalExamples[0]);
  const [notes, setNotes] = useState(
    "Przykład: pacjent ma trudność z regularnym piciem, chce przygotować pytania na wizytę i notować tolerancję posiłków.",
  );
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generatePlan() {
    if (!stage || !goal.trim() || isLoading) {
      return;
    }

    setResult("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/bariatric", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ stage, goal, notes }),
      });
      const text = await response.text();

      if (!response.ok) {
        throw new Error(text || "BariCare AI nie zwrócił odpowiedzi.");
      }

      if (!text.trim()) {
        throw new Error("BariCare AI zwrócił pustą odpowiedź. Spróbuj krótszym opisem.");
      }

      setResult(text);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Nie udało się przygotować planu.");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyResult() {
    await navigator.clipboard.writeText(result);
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="BariCare AI">
        <AppNav active="/bariatric" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Scenariusz medyczny - asystent pacjenta</p>
            <h1>BariCare AI</h1>
            <p className="subtitle">
              Edukacyjny asystent pacjenta przed i po operacji bariatrycznej. Pomaga przygotować
              pytania, dzienniczek, checklistę i raport dla dietetyka, ale nie zastępuje opieki medycznej.
            </p>
            <div className="sample-questions" aria-label="Przykładowe cele pacjenta">
              {goalExamples.map((example) => (
                <button disabled={isLoading} key={example} type="button" onClick={() => setGoal(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
          <div className="model-pill expert">bezpieczne wsparcie</div>
        </header>

        <section className="error-box" role="note">
          <p>
            Ważne: BariCare AI nie diagnozuje, nie zmienia zaleceń lekarza i nie dobiera leków ani
            suplementów. Przy bólu brzucha, uporczywych wymiotach, gorączce, duszności, krwawieniu,
            odwodnieniu lub gwałtownym pogorszeniu samopoczucia pacjent powinien pilnie skontaktować
            się ze specjalistą.
          </p>
        </section>

        <form
          className="competitor-form"
          onSubmit={(event) => {
            event.preventDefault();
            generatePlan();
          }}
        >
          <label className="competitor-context">
            Etap pacjenta
            <select
              className="report-input"
              disabled={isLoading}
              onChange={(event) => setStage(event.target.value)}
              value={stage}
            >
              {stageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="competitor-context">
            Cel wsparcia
            <textarea
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Np. przygotowanie do wizyty, lista pytań, dzienniczek płynów, objawy alarmowe albo raport dla dietetyka..."
              rows={3}
              value={goal}
            />
          </label>

          <label className="competitor-context">
            Notatki pacjenta / dzienniczek
            <textarea
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Np. tolerowane produkty, ilość płynów, objawy, pytania, zalecenia od specjalisty..."
              rows={5}
              value={notes}
            />
          </label>

          <button className="report-button" type="submit" disabled={isLoading || !goal.trim()}>
            {isLoading ? "Tworzę plan..." : "Wygeneruj plan BariCare"}
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
              <p>
                Wybierz etap, opisz cel pacjenta i dodaj notatki. Agent przygotuje odpowiedź dopasowaną
                do sytuacji: pytania, dzienniczek, checklistę, raport albo bezpieczne przypomnienie.
              </p>
            </div>
          )}

          {(result || isLoading) && (
            <>
              <div className="report-actions">
                <span>{isLoading ? "BariCare analizuje etap i notatki..." : "Plan gotowy"}</span>
                <button type="button" onClick={copyResult} disabled={!result}>
                  Kopiuj plan
                </button>
              </div>
              <article className="markdown-content report-document competitor-document">
                {result ? renderMarkdown(result) : <p>Przygotowuję bezpieczny plan wsparcia...</p>}
              </article>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
