"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { Fragment, useEffect, useRef, useState } from "react";

const formatCommands = [
  "/tabela języki programowania 2026",
  "/porownanie ChatGPT vs Claude",
  "/lista 5 kroków do pierwszego agenta AI",
  "/faq sztuczna inteligencja dla początkujących",
  "/email podziękowanie za udaną rekrutację",
];

type FormatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

function messageText(message: FormatMessage) {
  return message.text;
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
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

export default function FormatPage() {
  const [input, setInput] = useState(formatCommands[0]);
  const [messages, setMessages] = useState<FormatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();

    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: FormatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
    };

    setInput("");
    setError(null);
    setIsLoading(true);
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/format", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            ...messages.map((message) => ({
              role: message.role,
              parts: [{ type: "text", text: message.text }],
            })),
            {
              role: userMessage.role,
              parts: [{ type: "text", text: userMessage.text }],
            },
          ],
        }),
      });
      const data = (await response.json()) as { text?: string; error?: string };

      if (!response.ok || !data.text) {
        throw new Error(data.error || "Formater nie zwrócił odpowiedzi.");
      }

      const formattedText = data.text;

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: formattedText,
        },
      ]);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udało się połączyć z formaterem.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Formatowanie">
        <AppNav active="/format" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 2 · Warsztat 4</p>
            <h1>Formatowanie</h1>
            <p className="subtitle">
              Agent odpowiada w tabeli, liście, porównaniu - na żądanie.
            </p>
            <div className="sample-questions" aria-label="Komendy formatujące">
              {formatCommands.map((command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => setInput(command)}
                  disabled={isLoading}
                >
                  {command}
                </button>
              ))}
            </div>
          </div>
          <div className="model-pill pro">markdown</div>
        </header>

        <section className="messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              <p>
                Wybierz komendę albo wpisz własną. Tabele, listy, FAQ i maile
                będą renderowane w czytelnym formacie.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <article
              className={`message ${message.role}`}
              key={message.id}
              aria-label={message.role === "user" ? "Użytkownik" : "Formater"}
            >
              {message.role === "assistant" && (
                <div className="badge-row">
                  <span className="model-badge pro">FORM</span>
                  <span className="badge expert">markdown</span>
                </div>
              )}
              <div className="bubble markdown-content">
                {renderMarkdown(messageText(message))}
              </div>
            </article>
          ))}

          {isLoading && (
            <article className="message assistant">
              <div className="badge-row">
                <span className="model-badge pro">FORM</span>
              </div>
              <div className="bubble thinking">Układam odpowiedź w formacie...</div>
            </article>
          )}

          <div ref={bottomRef} />
        </section>

        {error && (
          <div className="error-box">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>
              Zamknij
            </button>
          </div>
        )}

        <div className="memory-actions standalone">
          <button type="button" onClick={() => setMessages([])}>
            🗑 Nowy format
          </button>
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            aria-label="Komenda formatowania"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="/tabela temat albo /porownanie A vs B..."
            value={input}
          />
          <button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? "Formatuję..." : "Formatuj"}
          </button>
        </form>
      </section>
    </main>
  );
}



