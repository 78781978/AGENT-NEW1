import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import {
  assertDailyTokenBudget,
  estimateTextTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";

type SearchSource = {
  title: string;
  url: string;
  snippet: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normalizeDuckUrl(rawUrl: string) {
  let url = decodeHtml(rawUrl);

  if (url.includes("/l/?")) {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://duckduckgo.com${url}`);
      url = parsed.searchParams.get("uddg") ?? url;
    } catch {
      return url;
    }
  }

  return url;
}

function uniqueSources(sources: SearchSource[]) {
  const seen = new Set<string>();

  return sources.filter((source) => {
    if (!source.url.startsWith("http") || seen.has(source.url)) {
      return false;
    }

    seen.add(source.url);
    return true;
  });
}

function extractHtmlResults(html: string): SearchSource[] {
  const results: SearchSource[] = [];
  const blocks = html.split(/<div class="result results_links|<div class="web-result/g);

  for (const block of blocks) {
    const link = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);

    if (!link) {
      continue;
    }

    const snippet =
      block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1] ??
      block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/)?.[1] ??
      "";

    results.push({
      title: stripTags(link[2]),
      url: normalizeDuckUrl(link[1]),
      snippet: stripTags(snippet),
    });
  }

  return uniqueSources(results).slice(0, 6);
}

function extractLiteResults(html: string): SearchSource[] {
  const results: SearchSource[] = [];
  const linkRegex = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = normalizeDuckUrl(match[1]);
    const title = stripTags(match[2]);

    if (!title || title.length < 3) {
      continue;
    }

    const afterLink = html.slice(match.index + match[0].length, match.index + match[0].length + 700);
    const snippet =
      stripTags(afterLink.match(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "") ||
      stripTags(afterLink).slice(0, 220);

    results.push({
      title,
      url,
      snippet,
    });

    if (results.length >= 6) {
      break;
    }
  }

  return uniqueSources(results).slice(0, 6);
}

function polishFirst(sources: SearchSource[]) {
  const polish = sources.filter((source) => {
    const text = `${source.title} ${source.snippet} ${source.url}`.toLowerCase();

    return (
      domainFromUrl(source.url).endsWith(".pl") ||
      /[ąćęłńóśźż]/i.test(text) ||
      text.includes("polska") ||
      text.includes("polsce")
    );
  });

  return polish.length > 0 ? polish : sources;
}

async function fetchSearchResults(query: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const enriched = `${query} Polska aktualne`;
  const urls = [
    `https://duckduckgo.com/html/?q=${encodeURIComponent(enriched)}&kl=pl-pl`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(enriched)}&kl=pl-pl`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=wt-wt`,
  ];

  try {
    for (const url of urls) {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 VieSearch/1.0",
          accept: "text/html,application/xhtml+xml,text/plain",
          "accept-language": "pl-PL,pl;q=0.9,en;q=0.6",
        },
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const sources = [...extractHtmlResults(html), ...extractLiteResults(html)];
      const unique = polishFirst(uniqueSources(sources));

      if (unique.length > 0) {
        return unique;
      }
    }

    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function readPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 VieSearch/1.0",
        accept: "text/html,application/xhtml+xml,text/plain",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.6",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return stripTags(await response.text()).slice(0, 5000);
  } finally {
    clearTimeout(timeout);
  }
}

function extractUrl(text: string) {
  return text.match(/https?:\/\/[^\s)]+/i)?.[0] ?? "";
}

function needsLocalContext(query: string) {
  const normalized = query.toLowerCase();
  const hasCity =
    /\b(w|we|dla|do)\s+[A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+/u.test(query) ||
    /\bkrak[oó]w|warszaw|gda[nń]sk|wroc[łl]aw|pozna[nń]|[łl][oó]d[źz]|szczecin|katowic|goleniów|goleniów\b/i.test(query);

  return (
    /kino|kinach|repertuar|restauracj|nocleg|hotel|pogoda|wydarzenia lokalne/i.test(normalized) &&
    !hasCity
  );
}

function localContextAnswer(query: string) {
  return [
    `## Potrzebuję doprecyzowania: ${query}`,
    "",
    "To pytanie zależy od lokalizacji, więc bez miasta mogłabym podać nieprecyzyjną odpowiedź.",
    "",
    "Podaj proszę jedno z poniższych:",
    "- miasto, np. Kraków, Warszawa, Goleniów,",
    "- nazwę kina, hotelu albo miejsca,",
    "- link do konkretnej strony, którą mam przeczytać.",
    "",
    "Przykład: **Jakie filmy są teraz w kinach w Krakowie?**",
    "",
    "Wtedy przygotuję krótkie, konkretne podsumowanie po polsku zamiast odsyłać Cię do samego linku.",
  ].join("\n");
}

function extractGroundedSources(result: unknown): SearchSource[] {
  const maybe = result as {
    sources?: Array<{ title?: string; url?: string; sourceType?: string }>;
    experimental_sources?: Array<{ title?: string; url?: string; sourceType?: string }>;
  };

  const rawSources = maybe.sources ?? maybe.experimental_sources ?? [];

  return uniqueSources(
    rawSources
      .map((source) => ({
        title: source.title?.trim() || (source.url ? domainFromUrl(source.url) : "Źródło"),
        url: source.url ?? "",
        snippet: source.sourceType ?? "Źródło użyte przez wyszukiwanie Google",
      }))
      .filter((source) => source.url.startsWith("http")),
  ).slice(0, 6);
}

async function buildGroundedAnswer(query: string, userId: string, request: Request) {
  const result = await generateText({
    model: google("gemini-3.1-flash-lite"),
    tools: {
      googleSearch: google.tools.googleSearch({}),
    },
    system: withResponseLanguage(request, [
      "Odpowiadasz po polsku, jasno i konkretnie.",
      "Najpierw szukasz polskich źródeł. Jeśli ich nie ma, możesz użyć zagranicznych.",
      "Nie zwracaj samego linku do Google. Przygotuj gotową odpowiedź w formie krótkiego artykułu lub praktycznego podsumowania.",
      "Jeżeli pytanie wymaga miasta, konkretnej firmy lub linku, dopytaj o brakującą informację zamiast zmyślać.",
      "Nie pokazuj technicznych kroków wykonywania narzędzi użytkownikowi.",
    ].join("\n")),
    prompt: [
      `Pytanie użytkownika: ${query}`,
      "",
      "Zadanie:",
      "1. Znajdź aktualne informacje.",
      "2. Streść je po polsku w 4-8 krótkich akapitach lub punktach.",
      "3. Jeśli temat jest niejednoznaczny, napisz dokładnie, czego brakuje.",
      "4. Na końcu dodaj sekcję: Źródła.",
    ].join("\n"),
  });

  await logApiUsage({
    userId,
    usage: result.usage,
    inputEstimate: estimateTextTokens(query),
    model: "gemini-3.1-flash-lite",
    endpoint: "/api/search",
  });

  return {
    text: result.text.trim(),
    sources: extractGroundedSources(result),
  };
}

function buildSourceBasedAnswer(query: string, sources: SearchSource[]) {
  const usedSources = polishFirst(sources).slice(0, 5);
  const domains = usedSources.map((source) => domainFromUrl(source.url)).join(", ");

  return [
    `## Wynik wyszukiwania: ${query}`,
    "",
    `Znalazłam wyniki i wybrałam najpierw polski kontekst. Najbardziej przydatne domeny: **${domains}**.`,
    "",
    "### Krótkie podsumowanie",
    ...usedSources.map((source) => `- **${source.title}**: ${source.snippet || "źródło może zawierać szczegóły dotyczące zapytania."}`),
    "",
    "### Źródła",
    ...usedSources.map((source, index) => `${index + 1}. [${source.title}](${source.url})`),
  ].join("\n");
}

function buildSafeFallback(query: string, error?: unknown) {
  const reason = error instanceof Error ? error.message : "";

  if (needsLocalContext(query)) {
    return localContextAnswer(query);
  }

  return [
    `## Nie mam jeszcze wystarczających danych: ${query}`,
    "",
    "Nie udało mi się teraz pobrać potwierdzonych wyników automatycznie, więc nie będę zmyślać odpowiedzi.",
    "",
    "Żeby przygotować rzetelne podsumowanie, wklej proszę:",
    "- link do oficjalnej strony lub artykułu,",
    "- pełną nazwę firmy z krajem lub branżą,",
    "- albo doprecyzuj miasto, jeśli pytanie dotyczy lokalnych wyników.",
    "",
    reason ? `Informacja techniczna: ${reason}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
    history?: Array<{ role?: unknown; text?: unknown }>;
  } | null;
  const rawQuery = typeof body?.query === "string" ? body.query.trim() : "";
  const previousLocalQuestion = [...(body?.history ?? [])]
    .slice(0, -1)
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        typeof message.text === "string" &&
        needsLocalContext(message.text),
    );
  const isShortLocationReply = /^[\p{L}-]{3,40}$/u.test(rawQuery);
  const query =
    isShortLocationReply && typeof previousLocalQuestion?.text === "string"
      ? `${previousLocalQuestion.text} w ${rawQuery}`
      : rawQuery;

  if (!rawQuery) {
    return Response.json({ error: "Wpisz pytanie albo adres strony." }, { status: 400 });
  }

  const url = extractUrl(query);

  try {
    if (url) {
      const content = await readPage(url);

      return Response.json({
        text: [
          `## Streszczenie strony: ${domainFromUrl(url)}`,
          "",
          content
            ? `${content.slice(0, 1800)}${content.length > 1800 ? "..." : ""}`
            : "Strona została pobrana, ale nie udało się wyciągnąć czytelnej treści.",
          "",
          `Źródło: [${domainFromUrl(url)}](${url})`,
        ].join("\n"),
        sources: [{ title: domainFromUrl(url), url, snippet: "Odczytana strona WWW" }],
      });
    }

    if (needsLocalContext(query)) {
      return Response.json({
        text: localContextAnswer(query),
        sources: [],
      });
    }

    try {
      const tokenBudget = await assertDailyTokenBudget(user);

      if (!tokenBudget.ok) {
        return Response.json({ text: tokenBudget.message, sources: [] }, { status: 429 });
      }

      const grounded = await buildGroundedAnswer(query, user.id, request);

      return Response.json({
        text: grounded.text,
        sources: grounded.sources,
      });
    } catch {
      const sources = await fetchSearchResults(query);

      if (sources.length > 0) {
        return Response.json({
          text: buildSourceBasedAnswer(query, sources),
          sources,
        });
      }

      return Response.json({
        text: buildSafeFallback(query),
        sources: [],
      });
    }
  } catch (error) {
    return Response.json({
      text: buildSafeFallback(query, error),
      sources: [],
    });
  }
}
