"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppNav } from "../../../components/AppNav";

type Details = { conversation: { id: string; title: string | null; updated_at: string }; messages: Array<{ id: string; role: "user" | "assistant"; content: string; created_at: string }> };

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/history/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Nie udało się wczytać rozmowy.");
        setDetails(data);
      } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Błąd rozmowy."); }
    }
    void load();
  }, [id]);
  if (error) return <main className="history-shell"><AppNav active="/history" /><div className="error-box"><p>{error}</p></div><Link href="/history">← Wróć do listy</Link></main>;
  if (!details) return <main className="history-shell"><AppNav active="/history" /><div className="history-empty">Wczytuję rozmowę...</div></main>;
  return (
    <main className="history-shell">
      <AppNav active="/history" />
      <div className="history-detail-actions"><Link href="/history">← Wróć do listy</Link><Link className="history-primary" href={`/chat?conversationId=${id}`}>Kontynuuj rozmowę</Link></div>
      <header className="history-header"><div><p className="eyebrow">Podgląd rozmowy</p><h1>{details.conversation.title || "Nowa rozmowa"}</h1><p>{new Date(details.conversation.updated_at).toLocaleString("pl-PL")}</p></div></header>
      <section className="history-messages">{details.messages.map((message) => (
        <article className={`history-message ${message.role}`} key={message.id}><div><small>{message.role === "user" ? "Ty" : "Vie"} · {new Date(message.created_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</small><p>{message.content}</p></div></article>
      ))}</section>
    </main>
  );
}

