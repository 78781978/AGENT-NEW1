import { google } from "@ai-sdk/google";
import {
  assertDailyTokenBudget,
  estimateTextTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";
import { jsonSchema, stepCountIs, streamText, tool } from "ai";

export const maxDuration = 60;

type WikipediaInput = {
  query: string;
  language?: string;
};

type ReadWebPageInput = {
  url: string;
};

type CalculatorInput = {
  expression: string;
};

const maxSteps = 8;
const isSearchGroundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";

const systemPrompt = `
Jesteś profesjonalnym analitykiem biznesowym. Gdy użytkownik poda temat,
AUTONOMICZNIE zbierasz informacje i piszesz raport.

## TWÓJ PROCES:
1. Przeanalizuj temat - co trzeba zbadać?
2. Szukaj danych: Google Search, Wikipedia, strony branżowe.
3. Zbierz fakty, liczby, statystyki.
4. Napisz raport w profesjonalnym formacie.

## FORMAT RAPORTU:

# 📊 Raport: [TEMAT]
Data: [dzisiejsza data]
Autor: Agent AI

## Streszczenie (Executive Summary)
[3-4 zdania - kluczowe wnioski]

## 1. Wprowadzenie
[Kontekst, dlaczego ten temat jest ważny]

## 2. Kluczowe dane i fakty
[Wylistowane punkty z danymi - ze źródłami]

## 3. Analiza
[Interpretacja danych, trendy, porównania]

## 4. Wnioski i rekomendacje
[Co z tego wynika? Co robić?]

## Źródła
[Lista użytych źródeł z linkami]

ZASADY:
- Używaj prawdziwych danych z narzędzi, gdy są dostępne.
- Podawaj źródła przy faktach.
- Bądź konkretny: liczby, daty, nazwy.
- Raport powinien mieć 500-1000 słów, chyba że użytkownik poda krótki temat testowy.
- Nie wymyślaj statystyk. Jeśli czegoś nie udało się potwierdzić, napisz to uczciwie.
- Pisz po polsku.
`;

function useSearchGrounding(): Record<string, any> {
  if (!isSearchGroundingEnabled) {
    return {};
  }

  return {
    google_search: google.tools.googleSearch({}),
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchWikipedia(query: string, language = "pl") {
  try {
    const response = await fetchWithTimeout(
      `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      {
        headers: {
          accept: "application/json",
          "accept-language": "pl-PL,pl;q=0.9,en;q=0.6",
        },
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        query,
        error: `Wikipedia zwróciła HTTP ${response.status}.`,
      };
    }

    const data = (await response.json()) as {
      title?: string;
      extract?: string;
      content_urls?: {
        desktop?: {
          page?: string;
        };
      };
    };

    return {
      ok: true,
      title: data.title ?? query,
      summary: data.extract ?? "Brak streszczenia.",
      url: data.content_urls?.desktop?.page ?? `https://${language}.wikipedia.org/wiki/${encodeURIComponent(query)}`,
    };
  } catch (error) {
    return {
      ok: false,
      query,
      error: error instanceof Error ? error.message : "Nie udało się pobrać Wikipedii.",
    };
  }
}

async function readWebPage(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return { ok: false, url, error: "Dozwolone są tylko adresy http i https." };
    }

    const response = await fetchWithTimeout(parsedUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 ReportAgent/1.0",
        accept: "text/html,text/plain,application/xhtml+xml",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.6",
      },
    });

    if (!response.ok) {
      return { ok: false, url, error: `Strona zwróciła HTTP ${response.status}.` };
    }

    return {
      ok: true,
      url,
      title: parsedUrl.hostname.replace(/^www\./, ""),
      content: stripHtml(await response.text()).slice(0, 5000),
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : "Nie udało się odczytać strony.",
    };
  }
}

function calculateExpression(expression: string) {
  const sanitized = expression.replace(",", ".").trim();

  if (!/^[\d\s+\-*/().%]+$/.test(sanitized)) {
    return {
      ok: false,
      expression,
      error: "Kalkulator przyjmuje tylko liczby i podstawowe operatory.",
    };
  }

  try {
    const result = Function(`"use strict"; return (${sanitized.replace(/%/g, "/100")});`)();

    return {
      ok: true,
      expression,
      result: Number(result),
    };
  } catch (error) {
    return {
      ok: false,
      expression,
      error: error instanceof Error ? error.message : "Nie udało się policzyć wyrażenia.",
    };
  }
}

function localReport(topic: string) {
  const date = new Date().toLocaleDateString("pl-PL");

  return [
    `# 📊 Raport: ${topic}`,
    `Data: ${date}`,
    "Autor: Agent AI",
    "",
    "## Streszczenie (Executive Summary)",
    "Ten raport został przygotowany w trybie awaryjnym, ponieważ model AI lub narzędzia wyszukiwania chwilowo nie odpowiedziały. Temat wymaga zebrania aktualnych źródeł, dlatego poniższy raport traktuj jako strukturę roboczą do uzupełnienia danymi.",
    "",
    "## 1. Wprowadzenie",
    `Temat "${topic}" warto analizować przez pryzmat rynku, klientów, konkurencji, kosztów, ryzyk i możliwych działań biznesowych. Dla firmy najważniejsze jest ustalenie, czy temat wpływa na sprzedaż, efektywność operacyjną albo decyzje strategiczne.`,
    "",
    "## 2. Kluczowe dane i fakty",
    "- Do pełnej wersji raportu należy zebrać aktualne źródła branżowe, oficjalne statystyki oraz dane rynkowe.",
    "- Warto porównać minimum 3 źródła, aby uniknąć oparcia decyzji na jednej opinii.",
    "- Jeśli raport dotyczy rynku, dobrym punktem odniesienia są dane GUS, raporty branżowe, strony producentów i publikacje instytucji publicznych.",
    "",
    "## 3. Analiza",
    "Najbardziej wartościowa analiza powinna pokazać trend, ryzyko i rekomendację działania. Sam opis tematu nie wystarczy - raport biznesowy musi prowadzić do decyzji.",
    "",
    "## 4. Wnioski i rekomendacje",
    "- Doprecyzuj cel raportu: sprzedaż, strategia, inwestycja, marketing albo operacje.",
    "- Zbierz aktualne dane z oficjalnych źródeł.",
    "- Porównaj minimum 3 warianty działania.",
    "- Na końcu wybierz jedną rekomendację i uzasadnij ją liczbami.",
    "",
    "## Źródła",
    "- Brak źródeł online w trybie awaryjnym. Uruchom ponownie raport, gdy API będzie dostępne.",
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const body = (await request.json().catch(() => null)) as { topic?: unknown } | null;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";

  if (!topic) {
    return Response.json({ error: "Podaj temat raportu." }, { status: 400 });
  }

  try {
    const tokenBudget = await assertDailyTokenBudget(user);

    if (!tokenBudget.ok) {
      return new Response(tokenBudget.message, {
        status: 429,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }

    const prompt = [
      `Temat raportu: ${topic}`,
      `Dzisiejsza data: ${new Date().toLocaleDateString("pl-PL")}`,
      "",
      "Przygotuj kompletny raport biznesowy zgodnie z formatem z system promptu.",
    ].join("\n");

    const result = streamText({
      model: google("gemini-3.1-flash-lite"),
      system: withResponseLanguage(request, systemPrompt),
      prompt,
      tools: {
        ...useSearchGrounding(),
        searchWikipedia: tool({
          description: "Wyszukuje hasło w Wikipedii i zwraca streszczenie oraz link.",
          inputSchema: jsonSchema<WikipediaInput>({
            type: "object",
            properties: {
              query: { type: "string", description: "Hasło lub temat." },
              language: { type: "string", description: "Kod języka, domyślnie pl." },
            },
            required: ["query"],
            additionalProperties: false,
          }),
          execute: async ({ query, language = "pl" }) => searchWikipedia(query, language),
        }),
        readWebPage: tool({
          description: "Czyta publiczną stronę WWW po adresie URL.",
          inputSchema: jsonSchema<ReadWebPageInput>({
            type: "object",
            properties: {
              url: { type: "string", description: "Pełny adres URL." },
            },
            required: ["url"],
            additionalProperties: false,
          }),
          execute: async ({ url }) => readWebPage(url),
        }),
        calculator: tool({
          description: "Liczy proste działania, procenty i porównania liczbowe.",
          inputSchema: jsonSchema<CalculatorInput>({
            type: "object",
            properties: {
              expression: { type: "string", description: "Wyrażenie matematyczne." },
            },
            required: ["expression"],
            additionalProperties: false,
          }),
          execute: async ({ expression }) => calculateExpression(expression),
        }),
      },
      stopWhen: stepCountIs(maxSteps),
      onFinish: async ({ usage }) => {
        await logApiUsage({
          userId: user.id,
          usage,
          inputEstimate: estimateTextTokens(`${systemPrompt}\n${prompt}`),
          model: "gemini-3.1-flash-lite",
          endpoint: "/api/report",
        });
      },
    });

    return result.toTextStreamResponse();
  } catch {
    return new Response(localReport(topic), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
}
