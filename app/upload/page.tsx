"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useEffect, useMemo, useState } from "react";
import { splitIntoChunks } from "../../lib/chunking";

type KnowledgeDocument = {
  title: string;
  chunks: number;
  created_at: string;
};

const sampleText = `CENNIK USŁUG 2026

Pakiet Basic: 99 zł/miesiąc
- 5 użytkowników
- 10 GB miejsca
- Wsparcie email

Pakiet Premium: 299 zł/miesiąc
- 25 użytkowników
- 100 GB miejsca
- Wsparcie email + telefon
- Priorytetowa obsługa

Pakiet VIP: 599 zł/miesiąc
- Nielimitowani użytkownicy
- 1 TB miejsca
- Wsparcie 24/7
- Dedykowany opiekun
- Szkolenie wdrożeniowe

Wszystkie pakiety z 14-dniowym okresem próbnym.
Faktura VAT wystawiana automatycznie.
Rezygnacja możliwa w dowolnym momencie.`;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UploadKnowledgePage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingList, setIsFetchingList] = useState(true);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const estimatedChunks = useMemo(() => splitIntoChunks(content).length, [content]);

  async function loadDocuments() {
    setIsFetchingList(true);
    setError("");

    try {
      const response = await fetch("/api/upload-knowledge", { cache: "no-store" });
      const data = (await response.json()) as {
        documents?: KnowledgeDocument[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się pobrać listy dokumentów.");
      }

      setDocuments(data.documents ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nie udało się pobrać listy dokumentów.",
      );
    } finally {
      setIsFetchingList(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || !content.trim() || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");
    setMessage("");
    setProgress(`Przetwarzam fragment 1 z ${Math.max(estimatedChunks, 1)}...`);

    let currentProgress = 1;
    const timer = window.setInterval(() => {
      currentProgress = Math.min(currentProgress + 1, Math.max(estimatedChunks - 1, 1));
      setProgress(`Przetwarzam fragment ${currentProgress} z ${Math.max(estimatedChunks, 1)}...`);
    }, 900);

    try {
      const response = await fetch("/api/upload-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        chunks_saved?: number;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Nie udało się zapisać dokumentu.");
      }

      setProgress(`Przetworzono ${data.chunks_saved} z ${data.chunks_saved} fragmentów.`);
      setMessage(`✅ Zapisano ${data.chunks_saved} fragmentów w bazie wiedzy.`);
      setTitle("");
      setContent("");
      await loadDocuments();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nie udało się zapisać dokumentu.",
      );
      setProgress("");
    } finally {
      window.clearInterval(timer);
      setIsLoading(false);
    }
  }

  async function deleteDocument(documentTitle: string) {
    if (isLoading) return;

    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/upload-knowledge?title=${encodeURIComponent(documentTitle)}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Nie udało się usunąć dokumentu.");
      }

      setMessage(`🗑️ Usunięto dokument: ${documentTitle}`);
      await loadDocuments();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Nie udało się usunąć dokumentu.",
      );
    }
  }

  return (
    <main className="chat-shell">
      <section className="chat-card wide">
        <AppNav active="/upload" />

        <header className="chat-header">
          <div>
            <p className="eyebrow">Lekcja 6 · RAG</p>
            <h1>📚 Baza wiedzy</h1>
            <p className="subtitle">
              Wklej tekst — agent będzie z niego korzystał zamiast zgadywać.
            </p>
          </div>
        </header>

        <section className="knowledge-layout">
          <form className="knowledge-form" onSubmit={handleSubmit}>
            <label>
              <span>Tytuł dokumentu</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Np. Cennik 2026, FAQ, Regulamin firmy"
              />
            </label>

            <label>
              <span>Treść dokumentu</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Wklej tutaj treść dokumentu..."
                rows={14}
              />
            </label>

            <div className="knowledge-actions">
              <button type="submit" disabled={isLoading || !title.trim() || !content.trim()}>
                {isLoading ? "Przetwarzam..." : "📤 Zapisz w bazie wiedzy"}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setTitle("Cennik usług 2026");
                  setContent(sampleText);
                }}
              >
                Wstaw przykład cennika
              </button>
            </div>

            <div className="knowledge-progress" aria-live="polite">
              {content.trim() ? (
                <p>Szacowana liczba fragmentów: {estimatedChunks || 1}</p>
              ) : (
                <p>Wklej dokument, a aplikacja policzy fragmenty.</p>
              )}

              {isLoading && (
                <div>
                  <span>{progress}</span>
                  <div className="progress-track">
                    <div className="progress-bar" />
                  </div>
                </div>
              )}
            </div>

            {message ? <div className="success-box">{message}</div> : null}
            {error ? <div className="error-box">{error}</div> : null}
          </form>

          <aside className="knowledge-list">
            <div className="knowledge-list-head">
              <div>
                <h2>Zapisane dokumenty</h2>
                <p>Lista tytułów z tabeli documents w Supabase.</p>
              </div>
              <button type="button" onClick={loadDocuments} disabled={isFetchingList}>
                Odśwież
              </button>
            </div>

            {isFetchingList ? (
              <p className="muted">Ładuję dokumenty...</p>
            ) : documents.length ? (
              <div className="knowledge-documents">
                {documents.map((document) => (
                  <article key={document.title} className="knowledge-document">
                    <div>
                      <h3>{document.title}</h3>
                      <p>
                        {document.chunks} fragmentów · dodano {formatDate(document.created_at)}
                      </p>
                    </div>
                    <button type="button" onClick={() => deleteDocument(document.title)}>
                      🗑️ Usuń
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">
                Nie ma jeszcze dokumentów. Wklej cennik, FAQ albo regulamin.
              </p>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

