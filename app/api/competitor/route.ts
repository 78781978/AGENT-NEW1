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

type CompetitorBody = {
  companies?: unknown;
  context?: unknown;
};

type WikipediaInput = {
  query: string;
  language?: string;
};

type ReadWebPageInput = {
  url: string;
};

const maxSteps = 10;
const isSearchGroundingEnabled = process.env.ENABLE_SEARCH_GROUNDING === "true";

const systemPrompt = `
Jestes analitykiem konkurencji. Gdy uzytkownik poda nazwy firm,
AUTONOMICZNIE zbierasz informacje i porownujesz je.

## TWOJ PROCES:
1. Dla KAZDEJ firmy: szukaj informacji w Google, Wikipedii i na stronach firmowych.
2. Zbierz: opis, branza, wielkosc, produkty, ceny, mocne i slabe strony.
3. Stworz tabele porownawcza.
4. Napisz rekomendacje w kontekscie uzytkownika.

## FORMAT:

# Analiza konkurencji

## Porownanie

| Aspekt | [Firma 1] | [Firma 2] | [Firma 3] |
|--------|-----------|-----------|-----------|
| Branza | ... | ... | ... |
| Wielkosc | ... | ... | ... |
| Glowny produkt | ... | ... | ... |
| Mocne strony | ... | ... | ... |
| Slabe strony | ... | ... | ... |
| Ceny orientacyjne | ... | ... | ... |

## Szczegolowa analiza
[Rozwiniecie dla kazdej firmy - 3-4 zdania]

## Rekomendacja
[Ktora firma jest najlepsza i dlaczego - w kontekscie uzytkownika]

## Zrodla
[Linki do stron firmowych i artykulow]

ZASADY:
- Pisz po polsku.
- Nie wymyslaj danych, ktorych nie da sie potwierdzic.
- Jesli ceny nie sa jawne, napisz: "brak jawnego cennika" albo "ceny zaleza od planu/oferty".
- Jesli wyszukiwanie nie zwroci danych, przygotuj ostrozne porownanie na podstawie ogolnej wiedzy i wyraznie zaznacz ograniczenia.
- Wynik ma byc gotowy do skopiowania do pracy domowej.
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
        error: `Wikipedia zwrocila HTTP ${response.status}.`,
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
      error: error instanceof Error ? error.message : "Nie udalo sie pobrac Wikipedii.",
    };
  }
}

async function readWebPage(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return { ok: false, url, error: "Dozwolone sa tylko adresy http i https." };
    }

    const response = await fetchWithTimeout(parsedUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 CompetitorAgent/1.0",
        accept: "text/html,text/plain,application/xhtml+xml",
        "accept-language": "pl-PL,pl;q=0.9,en;q=0.6",
      },
    });

    if (!response.ok) {
      return { ok: false, url, error: `Strona zwrocila HTTP ${response.status}.` };
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
      error: error instanceof Error ? error.message : "Nie udalo sie odczytac strony.",
    };
  }
}

function normalizeCompanies(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((company) => (typeof company === "string" ? company.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
}

function localCompetitorFallback(companies: string[], context: string) {
  const [first = "Firma 1", second = "Firma 2", third = "Firma 3"] = companies;

  return [
    "# Analiza konkurencji",
    "",
    "Tryb awaryjny: model lub narzedzia wyszukiwania chwilowo nie odpowiedzialy, wiec przygotowalam bezpieczny szablon analizy. Uzupelnij go po ponownym uruchomieniu agenta albo po dodaniu linkow do oficjalnych stron firm.",
    "",
    "## Porownanie",
    "",
    `| Aspekt | ${first} | ${second} | ${third} |`,
    "|--------|-----------|-----------|-----------|",
    "| Branza | do potwierdzenia | do potwierdzenia | do potwierdzenia |",
    "| Wielkosc | do sprawdzenia w zrodlach | do sprawdzenia w zrodlach | do sprawdzenia w zrodlach |",
    "| Glowny produkt | oferta podstawowa firmy | oferta podstawowa firmy | oferta podstawowa firmy |",
    "| Mocne strony | rozpoznawalnosc, oferta, dostepnosc | rozpoznawalnosc, oferta, dostepnosc | rozpoznawalnosc, oferta, dostepnosc |",
    "| Slabe strony | wymaga weryfikacji opinii i cen | wymaga weryfikacji opinii i cen | wymaga weryfikacji opinii i cen |",
    "| Ceny orientacyjne | sprawdz oficjalny cennik | sprawdz oficjalny cennik | sprawdz oficjalny cennik |",
    "",
    "## Szczegolowa analiza",
    `Analiza dotyczy firm: ${companies.join(", ")}.`,
    context ? `Kontekst uzytkownika: ${context}.` : "Kontekst uzytkownika nie zostal podany.",
    "Do pelnej decyzji trzeba sprawdzic oficjalne strony, aktualne cenniki, opinie klientow, funkcje produktu i koszty wdrozenia.",
    "",
    "## Rekomendacja",
    "Najpierw porownaj firmy wedlug celu biznesowego: cena, latwosc wdrozenia, skalowalnosc, wsparcie i ryzyko utrzymania. Najlepsza firma to nie zawsze najwieksza marka, tylko ta, ktora najlepiej pasuje do konkretnego zastosowania.",
    "",
    "## Zrodla",
    "- Do uzupelnienia po ponownym uruchomieniu wyszukiwania albo po podaniu linkow do stron firm.",
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const body = (await request.json().catch(() => null)) as CompetitorBody | null;
  const companies = normalizeCompanies(body?.companies);
  const context = typeof body?.context === "string" ? body.context.trim() : "";

  if (companies.length !== 3) {
    return Response.json({ error: "Podaj dokladnie 3 nazwy firm do porownania." }, { status: 400 });
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
      `Firmy do porownania: ${companies.join(", ")}`,
      context ? `Kontekst decyzji: ${context}` : "Kontekst decyzji: nie podano.",
      `Dzisiejsza data: ${new Date().toLocaleDateString("pl-PL")}`,
      "",
      "Wykonaj analize konkurencji zgodnie z formatem. Dla kazdej firmy uzyj dostepnych narzedzi przynajmniej raz, jesli to mozliwe.",
    ].join("\n");

    const result = streamText({
      model: google("gemini-3.1-flash-lite"),
      system: withResponseLanguage(request, systemPrompt),
      prompt,
      tools: {
        ...useSearchGrounding(),
        searchWikipedia: tool({
          description: "Wyszukuje firme lub produkt w Wikipedii i zwraca streszczenie oraz link.",
          inputSchema: jsonSchema<WikipediaInput>({
            type: "object",
            properties: {
              query: { type: "string", description: "Nazwa firmy, produktu albo tematu." },
              language: { type: "string", description: "Kod jezyka, domyslnie pl." },
            },
            required: ["query"],
            additionalProperties: false,
          }),
          execute: async ({ query, language = "pl" }) => searchWikipedia(query, language),
        }),
        readWebPage: tool({
          description: "Czyta publiczna strone WWW po adresie URL.",
          inputSchema: jsonSchema<ReadWebPageInput>({
            type: "object",
            properties: {
              url: { type: "string", description: "Pelny adres URL." },
            },
            required: ["url"],
            additionalProperties: false,
          }),
          execute: async ({ url }) => readWebPage(url),
        }),
      },
      stopWhen: stepCountIs(maxSteps),
      onFinish: async ({ usage }) => {
        await logApiUsage({
          userId: user.id,
          usage,
          inputEstimate: estimateTextTokens(`${systemPrompt}\n${prompt}`),
          model: "gemini-3.1-flash-lite",
          endpoint: "/api/competitor",
        });
      },
    });

    return result.toTextStreamResponse();
  } catch {
    return new Response(localCompetitorFallback(companies, context), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
}
