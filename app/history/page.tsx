"use client";

import Link from "next/link";
import { AppNav } from "../../components/AppNav";
import { useEffect, useMemo, useState } from "react";

type Conversation = { id: string; title: string | null; updated_at: string; messageCount: number; preview: string };

function relativeDate(value: string) {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("pl", { numeric: "auto" });
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  if (Math.abs(seconds) < 604800) return formatter.format(Math.round(seconds / 86400), "day");
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Nie udało się wczytać historii.");
        setConversations(data.conversations);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Błąd historii.");
      } finally { setLoading(false); }
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    const phrase = query.trim().toLocaleLowerCase("pl");
    return phrase ? conversations.filter((item) => `${item.title ?? ""} ${item.preview}`.toLocaleLowerCase("pl").includes(phrase)) : conversations;
  }, [conversations, query]);

  async function removeConversation(id: string, title: string) {
    if (!window.confirm(`Czy na pewno chcesz usunąć rozmowę „${title}”? Tej operacji nie można cofnąć.`)) return;
    const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "Nie udało się usunąć rozmowy.");
    setConversations((current) => current.filter((item) => item.id !== id));
    setNotice("Rozmowa usunięta");
    window.setTimeout(() => setNotice(""), 2500);
  }

  return (
    <main className="history-shell">
      <AppNav active="/history" />
      <header className="history-header"><div><p className="eyebrow">Pamięć agenta</p><h1>📜 Historia rozmów</h1><p>Wszystkie Twoje rozmowy z agentem</p></div><Link className="history-primary" href="/chat">+ Rozpocznij rozmowę</Link></header>
      <input className="history-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Szukaj w rozmowach..." />
      {notice && <div className="history-toast">{notice}</div>}
      {error && <div className="error-box"><p>{error}</p></div>}
      {loading ? <div className="history-empty">Wczytuję rozmowy...</div> : filtered.length === 0 ? (
        <div className="history-empty"><h2>Nie masz jeszcze żadnych rozmów</h2><p>Zacznij nową rozmowę z Vie.</p><Link className="history-primary" href="/chat">Rozpocznij rozmowę</Link></div>
      ) : <section className="history-grid">{filtered.map((conversation) => (
        <article className="history-card" key={conversation.id}>
          <Link href={`/history/${conversation.id}`}><h2>{conversation.title || "Nowa rozmowa"}</h2><p className="history-meta">{relativeDate(conversation.updated_at)} · {conversation.messageCount} wiadomości</p><p className="history-preview">{conversation.preview.slice(0, 100)}{conversation.preview.length > 100 ? "…" : ""}</p></Link>
          <button type="button" onClick={() => removeConversation(conversation.id, conversation.title || "Nowa rozmowa")}>🗑 Usuń</button>
        </article>
      ))}</section>}
    </main>
  );
}

