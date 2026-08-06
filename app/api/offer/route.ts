import { google } from "@ai-sdk/google";
import {
  assertDailyTokenBudget,
  estimateTextTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";

export const maxDuration = 60;

type OfferBody = {
  brief?: unknown;
};

type WikipediaInput = {
  query: string;
  language?: string;
};

type CalculatorInput = {
  expression: string;
};

type ReadWebPageInput = {
  url: string;
};

const maxSteps = 9;
const isSearchGroundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";

const systemPrompt = `
Jesteś senior AI consultant i tworzysz ofertę wdrożenia automatyzacji AI dla małej firmy.

Masz działać biznesowo, konkretnie i ostrożnie. Nie obiecuj cudów. Nie wpisuj gwarantowanych wyników finansowych.

## Proces agenta
1. Rozpoznaj branżę, problem klienta, cel i ryzyko.
2. Jeżeli możesz, użyj Google Search lub Wikipedii do kontekstu branży.
3. Użyj kalkulatora do orientacyjnego budżetu i abonamentu.
4. Przygotuj gotową ofertę, którą można wysłać klientowi.

## Format odpowiedzi

# Oferta wdrożenia AI dla klienta

## 1. Krótka diagnoza
[3-5 zdań: co klient potrzebuje i dlaczego]

## 2. Proponowane rozwiązanie
[konkretny system lub agent, np. obsługa zapytań, automatyzacja maili, CRM, raporty, baza wiedzy]

## 3. Zakres MVP
| Moduł | Co robi | Wartość dla klienta |
|------|---------|---------------------|
| ... | ... | ... |

## 4. Etapy wdrożenia
1. Audyt i zebranie danych
2. Prototyp
3. Testy na danych testowych
4. Wdrożenie pilotażowe
5. Poprawki i szkolenie

## 5. Orientacyjna wycena
Podaj widełki:
- start / MVP,
- miesięczne utrzymanie,
- opcje dodatkowe.

## 6. Ryzyka i zabezpieczenia
[dane, zgody, konta produkcyjne, backup, limity API, akceptacja człowieka]

## 7. Gotowy e-mail do klienta
[profesjonalna wiadomość, prosta, bez technicznego żargonu]

## 8. Co trzeba ustalić przed startem
[lista pytań do klienta]

Zasady:
- Pisz po polsku.
- Używaj prostego języka.
- Jeśli brakuje danych, załóż rozsądny wariant testowy i jasno to zaznacz.
- Oferta ma być gotowa do skopiowania.
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
      return { ok: false, query, error: `Wikipedia zwróciła HTTP ${response.status}.` };
    }

    const data = (await response.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
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
        "user-agent": "Mozilla/5.0 OfferAgent/1.0",
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
    return { ok: false, expression, error: "Kalkulator przyjmuje tylko liczby i podstawowe operatory." };
  }

  try {
    const result = Function(`"use strict"; return (${sanitized.replace(/%/g, "/100")});`)();
    return { ok: true, expression, result: Number(result) };
  } catch (error) {
    return {
      ok: false,
      expression,
      error: error instanceof Error ? error.message : "Nie udało się policzyć wyrażenia.",
    };
  }
}

function localOffer(brief: string) {
  return [
    "# Oferta wdrożenia AI dla klienta",
    "",
    "## 1. Krótka diagnoza",
    `Klient opisał potrzebę: ${brief}. Na potrzeby MVP zakładam, że chodzi o uporządkowanie powtarzalnych zadań, ograniczenie ręcznej pracy i szybszą obsługę zapytań. Najlepszym pierwszym krokiem jest mały, kontrolowany system testowy, a nie duże wdrożenie od razu.`,
    "",
    "## 2. Proponowane rozwiązanie",
    "Proponuję asystenta AI z bazą wiedzy firmy, prostym panelem do rozmów, historią zgłoszeń i możliwością generowania odpowiedzi, ofert lub raportów. System powinien działać najpierw na danych testowych, a dopiero po akceptacji przejść do prawdziwych procesów.",
    "",
    "## 3. Zakres MVP",
    "| Moduł | Co robi | Wartość dla klienta |",
    "|------|---------|---------------------|",
    "| Baza wiedzy | Przechowuje FAQ, cennik i procedury | Mniej powtarzalnych pytań |",
    "| Agent odpowiedzi | Przygotowuje propozycje odpowiedzi | Szybsza obsługa klienta |",
    "| Panel akceptacji | Człowiek zatwierdza treści | Większe bezpieczeństwo |",
    "| Raport działań | Pokazuje tematy i liczbę spraw | Lepsza kontrola procesu |",
    "",
    "## 4. Etapy wdrożenia",
    "1. Audyt procesu i zebranie pytań klientów",
    "2. Przygotowanie danych testowych",
    "3. Budowa prototypu",
    "4. Testy odpowiedzi i zabezpieczeń",
    "5. Wdrożenie pilotażowe oraz szkolenie",
    "",
    "## 5. Orientacyjna wycena",
    "- MVP: 3500-8500 zł netto",
    "- Utrzymanie miesięczne: 500-1500 zł netto",
    "- Rozszerzenia, integracje i automatyzacje: wycena po audycie",
    "",
    "## 6. Ryzyka i zabezpieczenia",
    "- Nie używamy haseł ani danych produkcyjnych w kodzie.",
    "- Klucze API zapisujemy jako zmienne środowiskowe.",
    "- Reklamacje, płatności i decyzje finansowe zatwierdza człowiek.",
    "- Przed wdrożeniem robimy kopię danych i testy na środowisku testowym.",
    "",
    "## 7. Gotowy e-mail do klienta",
    "Dzień dobry, przygotowałam propozycję małego wdrożenia AI, które pozwoli przetestować automatyzację bez ryzyka dla bieżącej pracy firmy. Na początku skupimy się na jednym procesie, zbudujemy prototyp, sprawdzimy jakość odpowiedzi i dopiero po akceptacji rozszerzymy system. Dzięki temu wdrożenie będzie bezpieczne, mierzalne i łatwe do rozwijania.",
    "",
    "## 8. Co trzeba ustalić przed startem",
    "- Jaki proces zabiera najwięcej czasu?",
    "- Jakie pytania lub zadania powtarzają się najczęściej?",
    "- Jakie dane możemy bezpiecznie wykorzystać testowo?",
    "- Kto będzie zatwierdzał odpowiedzi agenta?",
    "- Jaki budżet klient chce przeznaczyć na MVP?",
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const body = (await request.json().catch(() => null)) as OfferBody | null;
  const brief = typeof body?.brief === "string" ? body.brief.trim() : "";

  if (!brief) {
    return Response.json({ error: "Wpisz opis klienta lub procesu." }, { status: 400 });
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

    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: withResponseLanguage(request, systemPrompt),
      prompt: [
        `Opis klienta i potrzeby: ${brief}`,
        `Dzisiejsza data: ${new Date().toLocaleDateString("pl-PL")}`,
        "",
        "Przygotuj gotową ofertę wdrożenia AI zgodnie z formatem. Użyj narzędzi, gdy pomagają w diagnozie, kosztach lub kontekście branży.",
      ].join("\n"),
      tools: {
        ...useSearchGrounding(),
        searchWikipedia: tool({
          description: "Wyszukuje branżę, firmę albo technologię w Wikipedii.",
          inputSchema: jsonSchema<WikipediaInput>({
            type: "object",
            properties: {
              query: { type: "string" },
              language: { type: "string" },
            },
            required: ["query"],
            additionalProperties: false,
          }),
          execute: async ({ query, language = "pl" }) => searchWikipedia(query, language),
        }),
        readWebPage: tool({
          description: "Czyta publiczną stronę WWW klienta lub konkurenta.",
          inputSchema: jsonSchema<ReadWebPageInput>({
            type: "object",
            properties: {
              url: { type: "string" },
            },
            required: ["url"],
            additionalProperties: false,
          }),
          execute: async ({ url }) => readWebPage(url),
        }),
        calculator: tool({
          description: "Liczy koszt wdrożenia, abonament, VAT, marżę i warianty cenowe.",
          inputSchema: jsonSchema<CalculatorInput>({
            type: "object",
            properties: {
              expression: { type: "string" },
            },
            required: ["expression"],
            additionalProperties: false,
          }),
          execute: async ({ expression }) => calculateExpression(expression),
        }),
      },
      stopWhen: stepCountIs(maxSteps),
    });

    await logApiUsage({
      userId: user.id,
      usage: result.usage,
      inputEstimate: estimateTextTokens(JSON.stringify({ brief })),
      model: "gemini-3.1-flash-lite",
      endpoint: "/api/offer",
    });

    return new Response(result.text?.trim() || localOffer(brief), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  } catch {
    return new Response(localOffer(brief), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
}
