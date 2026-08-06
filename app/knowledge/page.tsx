"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useEffect, useState } from "react";

type KnowledgeDocument = {
  title: string;
  chunks: number;
  created_at: string;
};

type KnowledgeChunk = {
  id: string;
  title: string;
  content: string;
  metadata: {
    source?: string;
    chunk_index?: number;
    total_chunks?: number;
  };
  created_at: string;
};

type SearchResult = {
  id: string;
  title: string;
  content: string;
  metadata: {
    source?: string;
    chunk_index?: number;
    total_chunks?: number;
  };
  similarity: number;
  added_at: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "brak daty";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function similarityPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  async function loadDocuments() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/knowledge-documents", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się pobrać bazy wiedzy.");
      }

      setDocuments(data.documents ?? []);
      setTotalChunks(data.total_chunks ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Błąd pobierania.");
    } finally {
      setLoading(false);
    }
  }

  async function loadChunks(title: string) {
    setSelectedTitle(title);
    setChunks([]);
    setError("");

    try {
      const response = await fetch(
        `/api/knowledge-documents?title=${encodeURIComponent(title)}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się pobrać fragmentów.");
      }

      setChunks(data.chunks ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Błąd fragmentów.");
    }
  }

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();

    if (!cleanQuery || searching) return;

    setSearching(true);
    setError("");
    setResults([]);
    setSources([]);

    try {
      const response = await fetch("/api/search-knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: cleanQuery }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się wykonać wyszukiwania.");
      }

      setResults(data.results ?? []);
      setSources(data.source_documents ?? []);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Błąd wyszukiwania.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  return (
    <main className="chat-shell">
      <section className="chat-card wide" aria-label="Twoja baza wiedzy">
        <AppNav active="/knowledge" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 6 · Warsztat 4</p>
            <h1>Twoja baza wiedzy</h1>
            <p className="subtitle">
              Sprawdź dokumenty, fragmenty i wyniki wyszukiwania zanim zapytasz
              agenta. Dzięki temu widać, skąd agent bierze odpowiedzi.
            </p>
          </div>
          <div className="knowledge-status">
            <strong>{totalChunks}</strong>
            <span>
              fragmentów z {documents.length}{" "}
              {documents.length === 1 ? "dokumentu" : "dokumentów"}
            </span>
          </div>
        </header>

        {error ? <div className="error-box">{error}</div> : null}

        <section className="knowledge-browser">
          <aside className="knowledge-list">
            <div className="knowledge-list-head">
              <div>
                <h2>Dokumenty</h2>
                <p>{loading ? "Wczytuję..." : "Kliknij dokument, aby zobaczyć fragmenty."}</p>
              </div>
              <button type="button" onClick={loadDocuments} disabled={loading}>
                Odśwież
              </button>
            </div>

            <div className="knowledge-documents">
              {documents.map((document) => (
                <button
                  className={selectedTitle === document.title ? "knowledge-doc-active" : ""}
                  key={document.title}
                  type="button"
                  onClick={() => loadChunks(document.title)}
                >
                  <strong>{document.title}</strong>
                  <span>
                    {document.chunks} fragmentów · dodano {formatDate(document.created_at)}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="knowledge-preview">
            <form className="knowledge-search" onSubmit={search}>
              <label>
                Test wyszukiwania
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Np. ile kosztuje pakiet Premium?"
                />
              </label>
              <button type="submit" disabled={searching}>
                {searching ? "Szukam..." : "Szukaj"}
              </button>
            </form>

            {sources.length > 0 ? (
              <div className="knowledge-source-note">
                Źródła wyniku: {sources.join(", ")}
              </div>
            ) : null}

            {results.length > 0 ? (
              <div className="knowledge-results">
                {results.map((result) => (
                  <article className="knowledge-chunk" key={result.id}>
                    <div>
                      <strong>{result.title}</strong>
                      <span className="similarity-pill">
                        podobieństwo {similarityPercent(result.similarity)}
                      </span>
                    </div>
                    <p>{result.content}</p>
                    <small>
                      Źródło: {result.metadata?.source ?? result.title} · fragment{" "}
                      {typeof result.metadata?.chunk_index === "number"
                        ? result.metadata.chunk_index + 1
                        : "?"}
                      /{result.metadata?.total_chunks ?? "?"} · dodano{" "}
                      {formatDate(result.added_at)}
                    </small>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="knowledge-results">
              {(selectedTitle ? chunks : []).map((chunk) => (
                <article className="knowledge-chunk" key={chunk.id}>
                  <div>
                    <strong>{chunk.title}</strong>
                    <span className="similarity-pill">
                      fragment{" "}
                      {typeof chunk.metadata?.chunk_index === "number"
                        ? chunk.metadata.chunk_index + 1
                        : "?"}
                      /{chunk.metadata?.total_chunks ?? "?"}
                    </span>
                  </div>
                  <p>{chunk.content}</p>
                  <small>Dodano: {formatDate(chunk.created_at)}</small>
                </article>
              ))}
              {selectedTitle && chunks.length === 0 ? (
                <div className="empty-state">Wczytuję fragmenty dokumentu...</div>
              ) : null}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

