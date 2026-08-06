"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "../../../components/AppNav";

type TrendPoint = { date: string; label: string; tokens: number; conversations: number };
type EndpointPoint = { name: string; tokens: number };
type DashboardData = {
  generatedAt: string;
  scope: "global" | "personal";
  metrics: { users: number; conversations: number; tokensToday: number; costToday: number };
  pricing: { inputPricePerMillion: number; outputPricePerMillion: number };
  trend: TrendPoint[];
  endpoints: EndpointPoint[];
  latestConversations: Array<{ id: string; email: string; title: string; updatedAt: string; messages: number }>;
};

const pieColors = ["#a7e22e", "#67e8d0", "#69a7ff", "#c68cff", "#ffb454"];

function formatNumber(value: number) {
  return new Intl.NumberFormat("pl-PL").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function LineChart({ data }: { data: TrendPoint[] }) {
  const width = 620;
  const height = 220;
  const padding = 28;
  const max = Math.max(...data.map((item) => item.tokens), 1);
  const points = data.map((item, index) => ({
    ...item,
    x: padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1),
    y: height - padding - (item.tokens / max) * (height - padding * 2),
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = `${path} L ${points.at(-1)?.x ?? padding} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <div className="usage-chart-wrap">
      <svg className="usage-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tokeny dziennie przez ostatnie 7 dni">
        <defs><linearGradient id="tokensArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a7e22e" stopOpacity=".32" /><stop offset="1" stopColor="#a7e22e" stopOpacity="0" /></linearGradient></defs>
        {[0, 1, 2, 3].map((line) => <line key={line} x1={padding} x2={width - padding} y1={padding + line * 48} y2={padding + line * 48} className="usage-grid-line" />)}
        <path d={area} fill="url(#tokensArea)" /><path d={path} className="usage-line" />
        {points.map((point) => <g key={point.date}><circle cx={point.x} cy={point.y} r="4" className="usage-line-point" /><text x={point.x} y={height - 7} textAnchor="middle">{point.label}</text><title>{`${point.date}: ${formatNumber(point.tokens)} tokenów`}</title></g>)}
      </svg>
    </div>
  );
}

function BarChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(...data.map((item) => item.conversations), 1);
  return (
    <div className="usage-bars" role="img" aria-label="Rozmowy dziennie przez ostatnie 7 dni">
      {data.map((item) => (
        <div key={item.date} className="usage-bar-column">
          <strong>{item.conversations}</strong>
          <div><i style={{ height: `${Math.max((item.conversations / max) * 100, item.conversations ? 8 : 2)}%` }} /></div>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: EndpointPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.tokens, 0);
  let offset = 0;
  const stops = data.map((item, index) => {
    const start = offset;
    offset += total ? (item.tokens / total) * 100 : 0;
    return `${pieColors[index % pieColors.length]} ${start}% ${offset}%`;
  });
  const background = total ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#293039 0 100%)";

  return (
    <div className="usage-donut-layout">
      <div className="usage-donut" style={{ background }} role="img" aria-label="Tokeny według endpointu"><div><strong>{formatNumber(total)}</strong><span>tokenów</span></div></div>
      <div className="usage-legend">
        {data.map((item, index) => <div key={item.name}><i style={{ background: pieColors[index % pieColors.length] }} /><span>{item.name}</span><strong>{total ? Math.round((item.tokens / total) * 100) : 0}%</strong></div>)}
      </div>
    </div>
  );
}

function LoadingCards() {
  return <div className="usage-metric-grid">{Array.from({ length: 4 }).map((_, index) => <div className="usage-metric usage-skeleton" key={index}><i /><i /><i /></div>)}</div>;
}

export default function UsageDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function loadData(refresh = false) {
    if (refresh) setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const payload = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się pobrać statystyk.");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nie udało się pobrać statystyk.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void loadData(); }, []);

  const metrics = useMemo(() => data ? [
    { icon: "👥", label: "Użytkownicy", value: formatNumber(data.metrics.users), detail: data.scope === "global" ? "aktywni w rozmowach" : "Twój profil", tone: "lime" },
    { icon: "💬", label: "Rozmowy", value: formatNumber(data.metrics.conversations), detail: "łącznie w bazie", tone: "cyan" },
    { icon: "🔤", label: "Tokeny dziś", value: formatNumber(data.metrics.tokensToday), detail: "input + output", tone: "blue" },
    { icon: "💰", label: "Koszt dziś", value: `$${data.metrics.costToday.toFixed(4)}`, detail: `input $${data.pricing.inputPricePerMillion}/1M`, tone: "violet" },
  ] : [], [data]);

  return (
    <main className="usage-dashboard-shell">
      <aside className="usage-sidebar"><Link href="/" className="usage-logo"><span>V</span><div><strong>Vie AI</strong><small>Admin console</small></div></Link><AppNav active="/admin/dashboard" /></aside>
      <section className="usage-dashboard-main">
        <header className="usage-header">
          <div><p className="usage-eyebrow">ANALITYKA · OSTATNIE 7 DNI</p><h1>📊 Dashboard użycia</h1><span>Kontroluj aktywność, tokeny i dzienny koszt agenta.</span></div>
          <button type="button" onClick={() => void loadData(true)} disabled={refreshing}>{refreshing ? "Odświeżam…" : "↻ Odśwież dane"}</button>
        </header>

        {error ? <div className="usage-error" role="alert"><strong>Nie udało się załadować danych</strong><span>{error}</span><button type="button" onClick={() => void loadData()}>Spróbuj ponownie</button></div> : null}
        {loading ? <LoadingCards /> : data ? <>
          <section className="usage-metric-grid" aria-label="Najważniejsze statystyki">
            {metrics.map((metric) => <article className={`usage-metric ${metric.tone}`} key={metric.label}><div><span>{metric.icon}</span><small>↗</small></div><p>{metric.label}</p><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}
          </section>

          <section className="usage-chart-grid">
            <article className="usage-panel usage-panel-wide"><header><div><p>TREND ZUŻYCIA</p><h2>Tokeny per dzień</h2></div><span>7 dni</span></header><LineChart data={data.trend} /></article>
            <article className="usage-panel"><header><div><p>AKTYWNOŚĆ</p><h2>Rozmowy per dzień</h2></div></header><BarChart data={data.trend} /></article>
            <article className="usage-panel"><header><div><p>DYSTRYBUCJA</p><h2>Tokeny per endpoint</h2></div></header><DonutChart data={data.endpoints} /></article>
          </section>

          <section className="usage-panel usage-table-panel">
            <header><div><p>OSTATNIA AKTYWNOŚĆ</p><h2>Ostatnie rozmowy</h2></div><Link href="/history">Pełna historia →</Link></header>
            <div className="usage-table-wrap"><table><thead><tr><th>Użytkownik</th><th>Tytuł</th><th>Data</th><th>Wiadomości</th></tr></thead><tbody>
              {data.latestConversations.length ? data.latestConversations.map((conversation) => <tr key={conversation.id}><td><span className="usage-user-avatar">{conversation.email.slice(0, 1).toUpperCase()}</span>{conversation.email}</td><td><Link href={`/history/${conversation.id}`}>{conversation.title}</Link></td><td>{formatDate(conversation.updatedAt)}</td><td><b>{conversation.messages}</b></td></tr>) : <tr><td className="usage-empty-row" colSpan={4}>Brak zapisanych rozmów. Pierwsze dane pojawią się po rozpoczęciu czatu.</td></tr>}
            </tbody></table></div>
          </section>
          <footer className="usage-data-footer">Dane wygenerowane {formatDate(data.generatedAt)} · zakres: {data.scope === "global" ? "globalny" : "Twoje konto"}</footer>
        </> : null}
      </section>
    </main>
  );
}
