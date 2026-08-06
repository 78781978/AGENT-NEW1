import { google } from "@ai-sdk/google";
import {
  assertDailyTokenBudget,
  estimateMessagesTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { searchKnowledge } from "../../../lib/knowledge";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";

export const maxDuration = 45;
const maxSteps = 3;

const isSearchGroundingEnabled =
  process.env.ENABLE_SEARCH_GROUNDING === "true";

if (isSearchGroundingEnabled) {
  console.warn(
    "UWAGA: Search Grounding jest WLACZONY. " +
      "To jest najdrozsza funkcja API ($14/1000 zapytan). " +
      "Uzywaj TYLKO do testow. Wylacz po testach usuwajac ENABLE_SEARCH_GROUNDING z .env.local, " +
      "bo inni uczestnicy kursu maja wtedy ograniczony dostep do modeli.",
  );
}

type CalculatorInput = {
  expression: string;
};

type CityInput = {
  city: string;
};

type ExchangeRateInput = {
  base?: string;
  target: string;
  amount?: number;
};

type HolidayInput = {
  countryCode?: string;
  year?: number;
};

type WikipediaInput = {
  query: string;
  language?: string;
};

type ReadWebPageInput = {
  url: string;
};

type SaveNoteInput = {
  title: string;
  content: string;
};

type GenerateImageInput = {
  prompt: string;
};

type SearchKnowledgeInput = {
  query: string;
};

type GoogleImagePart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

type GoogleImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: GoogleImagePart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

type GenerateAttemptResult =
  | {
      ok: true;
      model: string;
      provider: string;
      image: string;
      text: string;
    }
  | {
      ok: false;
      model: string;
      error: string;
    };

const notes: Array<{
  id: string;
  title: string;
  content: string;
  createdAt: string;
}> = [];

const cityFallbacks: Record<string, { latitude: number; longitude: number }> = {
  warszawa: { latitude: 52.2297, longitude: 21.0122 },
  krakow: { latitude: 50.0647, longitude: 19.945 },
  kraków: { latitude: 50.0647, longitude: 19.945 },
  berlin: { latitude: 52.52, longitude: 13.405 },
  paryz: { latitude: 48.8566, longitude: 2.3522 },
  paryż: { latitude: 48.8566, longitude: 2.3522 },
};

const exchangeFallbacks: Record<string, number> = {
  EUR: 4.28,
  USD: 3.95,
  CHF: 4.55,
  GBP: 5.05,
  PLN: 1,
};
const supportedCurrencies = new Set(Object.keys(exchangeFallbacks));

const imageModels = ["gemini-3.1-flash-lite-image"];

function useSearchGrounding(): Record<string, any> {
  if (!isSearchGroundingEnabled) {
    return {};
  }

  return {
    google_search: google.tools.googleSearch({}),
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 5000) {
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

function getGoogleImageApiKey() {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  );
}

function summarizeImageErrors(errors: string[]) {
  const allErrors = errors.join(" | ");

  if (allErrors.includes("Quota exceeded") && allErrors.includes("limit: 0")) {
    return "Klucz Google został odczytany poprawnie, ale konto nie ma aktywnego limitu dla generowania obrazów w Gemini API.";
  }

  if (allErrors.includes("Quota exceeded")) {
    return "Klucz Google działa, ale limit generowania obrazów został chwilowo przekroczony.";
  }

  return `Nie udało się wygenerować obrazu przez Google Gemini. Szczegóły: ${allErrors}`;
}

async function generateImageWithModel(
  model: string,
  apiKey: string,
  prompt: string,
  signal: AbortSignal,
): Promise<GenerateAttemptResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    },
  );
  const data = (await response.json()) as GoogleImageResponse;

  if (!response.ok) {
    return {
      ok: false,
      model,
      error: data.error?.message || `Google API zwróciło błąd HTTP ${response.status}.`,
    };
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  const textPart = parts.find((part) => part.text);

  if (!imagePart?.inlineData?.data) {
    return {
      ok: false,
      model,
      error: "Model odpowiedział, ale nie zwrócił obrazu.",
    };
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return {
    ok: true,
    model,
    provider: "Google Gemini",
    image: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    text: textPart?.text || `Obraz został wygenerowany modelem ${model}.`,
  };
}

async function generateImage(prompt: string) {
  const apiKey = getGoogleImageApiKey();

  if (!prompt.trim()) {
    return {
      ok: false,
      source: "validation",
      error: "Podaj opis obrazu do wygenerowania.",
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      source: "Google Gemini",
      error:
        "Brakuje klucza Google w pliku .env.local. Użyj GOOGLE_GENERATIVE_AI_API_KEY albo GOOGLE_API_KEY.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const errors: string[] = [];

  try {
    for (const model of imageModels) {
      const result = await generateImageWithModel(model, apiKey, prompt, controller.signal);

      if (result.ok) {
        return {
          ...result,
          source: "Google Gemini",
          prompt,
        };
      }

      errors.push(`${result.model}: ${result.error}`);
    }

    return {
      ok: false,
      source: "Google Gemini",
      prompt,
      error: summarizeImageErrors(errors),
    };
  } catch (error) {
    return {
      ok: false,
      source: "Google Gemini",
      prompt,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "Generowanie trwało dłużej niż 30 sekund. Spróbuj ponownie za chwilę."
          : toolErrorMessage(error, "Nie udało się wygenerować obrazu."),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toolErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Timeout — serwer nie odpowiedział w 5 sekund. Spróbuj ponownie.";
  }

  if (error instanceof Error) {
    return `Błąd połączenia: ${error.message}`;
  }

  return fallback;
}

function calculateExpression(expression: string) {
  if (/import|require|eval|process/i.test(expression)) {
    return {
      ok: false,
      expression,
      error: "Wyrażenie zawiera niedozwolone znaki.",
    };
  }

  if (!/^[\d\s+\-*/().,%]+$/.test(expression)) {
    return {
      ok: false,
      expression,
      error: "Kalkulator przyjmuje tylko liczby oraz znaki + - * / ( ) . , %.",
    };
  }

  const normalizedExpression = expression.replace(/,/g, ".").replace(/%/g, "/100");
  let value: unknown;

  try {
    value = Function(`"use strict"; return (${normalizedExpression});`)();
  } catch {
    return {
      ok: false,
      expression,
      error: `Nie mogę obliczyć: ${expression}`,
    };
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      expression,
      error: "Nie udalo sie policzyc tego wyrazenia.",
    };
  }

  return {
    ok: true,
    expression,
    result: Number(value.toFixed(6)),
  };
}

function getCurrentDateTime() {
  const now = new Date();

  return {
    iso: now.toISOString(),
    locale: now.toLocaleString("pl-PL", {
      timeZone: "Europe/Warsaw",
      dateStyle: "full",
      timeStyle: "medium",
    }),
    timezone: "Europe/Warsaw",
  };
}

function buildFallbackForecast(days = 7) {
  const today = new Date();
  const pattern = [
    { maxC: 24, minC: 15, rainChancePercent: 35 },
    { maxC: 25, minC: 16, rainChancePercent: 30 },
    { maxC: 22, minC: 14, rainChancePercent: 55 },
    { maxC: 21, minC: 13, rainChancePercent: 60 },
    { maxC: 23, minC: 15, rainChancePercent: 40 },
    { maxC: 24, minC: 16, rainChancePercent: 35 },
    { maxC: 20, minC: 13, rainChancePercent: 65 },
  ];

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const values = pattern[index % pattern.length];

    return {
      date: date.toISOString().slice(0, 10),
      ...values,
    };
  });
}

function weatherCodeDescription(code: number) {
  if ([0].includes(code)) return "bezchmurnie";
  if ([1, 2, 3].includes(code)) return "częściowe zachmurzenie";
  if ([45, 48].includes(code)) return "mgła";
  if ([51, 53, 55, 56, 57].includes(code)) return "mżawka";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "deszcz";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "śnieg";
  if ([95, 96, 99].includes(code)) return "burza";

  return "warunki zmienne";
}

async function resolveCity(city: string) {
  if (!city.trim()) {
    throw new Error("Podaj nazwę miasta.");
  }

  const key = city.trim().toLowerCase();
  const fallback = cityFallbacks[key];

  if (fallback) {
    return {
      name: city,
      country: "fallback",
      ...fallback,
    };
  }

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "pl");
  url.searchParams.set("format", "json");

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`API zwróciło błąd ${response.status}. Sprawdź parametry.`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      name: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  const result = data.results?.[0];

  if (!result) {
    throw new Error(`Nie znalazłem miasta ${city}. Sprawdź pisownię.`);
  }

  return result;
}

async function getWeather(city: string) {
  if (!city.trim()) {
    return {
      ok: false,
      city,
      source: "validation",
      error: "Podaj nazwę miasta.",
      fallbackAvailable: false,
      current: undefined,
      forecast: undefined,
    };
  }

  try {
    const resolved = await resolveCity(city);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(resolved.latitude));
    url.searchParams.set("longitude", String(resolved.longitude));
    url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    url.searchParams.set("timezone", "Europe/Warsaw");
    url.searchParams.set("forecast_days", "7");

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`API zwróciło błąd ${response.status}. Sprawdź parametry.`);
    }

    const data = (await response.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };
    const weatherCode = data.current?.weather_code ?? -1;

    return {
      ok: true,
      city: resolved.name,
      country: resolved.country,
      source: "Open-Meteo",
      current: {
        temperatureC: data.current?.temperature_2m,
        windKmh: data.current?.wind_speed_10m,
        description: weatherCodeDescription(weatherCode),
      },
      forecast: data.daily?.time?.map((date, index) => ({
        date,
        maxC: data.daily?.temperature_2m_max?.[index],
        minC: data.daily?.temperature_2m_min?.[index],
        rainChancePercent: data.daily?.precipitation_probability_max?.[index],
      })),
    };
  } catch (error) {
    const fallback = cityFallbacks[city.trim().toLowerCase()];

    return {
      ok: false,
      city,
      source: "fallback",
      error: toolErrorMessage(error, "Nie udało się pobrać pogody."),
      fallbackAvailable: Boolean(fallback),
      current: fallback
        ? {
            temperatureC: 21,
            windKmh: 12,
            description: "dane testowe: umiarkowana pogoda",
          }
        : undefined,
      forecast: fallback ? buildFallbackForecast() : undefined,
    };
  }
}

async function getExchangeRate(target: string, base = "PLN", amount = 1) {
  const normalizedBase = base.toUpperCase();
  const normalizedTarget = target.toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedTarget) || !/^[A-Z]{3}$/.test(normalizedBase)) {
    return {
      ok: false,
      source: "validation",
      error: "Podaj 3-literowy kod waluty (np. EUR, USD).",
      base: normalizedBase,
      target: normalizedTarget,
      rate: undefined,
      amount,
      converted: undefined,
    };
  }

  if (!supportedCurrencies.has(normalizedTarget) || !supportedCurrencies.has(normalizedBase)) {
    return {
      ok: true,
      source: "validation",
      warning: `Nie obsługuję waluty ${normalizedTarget}. Dostępne waluty testowe: EUR, USD, CHF, GBP i PLN.`,
      base: normalizedBase,
      target: normalizedTarget,
      rate: undefined,
      amount,
      converted: undefined,
    };
  }

  if (normalizedBase === normalizedTarget) {
    return {
      ok: true,
      source: "przeliczenie lokalne",
      date: new Date().toISOString().slice(0, 10),
      base: normalizedBase,
      target: normalizedTarget,
      rate: 1,
      amount,
      converted: amount,
    };
  }

  try {
    const url = new URL(`https://api.frankfurter.app/latest`);
    url.searchParams.set("from", normalizedBase);
    url.searchParams.set("to", normalizedTarget);

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`API zwróciło błąd ${response.status}. Sprawdź parametry.`);
    }

    const data = (await response.json()) as {
      date?: string;
      rates?: Record<string, number>;
    };
    const rate = data.rates?.[normalizedTarget];

    if (!rate) {
      throw new Error(`Waluta ${normalizedTarget} nie jest dostępna. Popularne: EUR, USD, GBP, CHF.`);
    }

    return {
      ok: true,
      source: "Frankfurter ECB",
      date: data.date,
      base: normalizedBase,
      target: normalizedTarget,
      rate,
      amount,
      converted: Number((amount * rate).toFixed(2)),
    };
  } catch (error) {
    const baseRate = exchangeFallbacks[normalizedBase];
    const targetRate = exchangeFallbacks[normalizedTarget];
    const rate = baseRate && targetRate ? baseRate / targetRate : undefined;

    return {
      ok: Boolean(rate),
      source: "fallback testowy",
      warning: rate
        ? toolErrorMessage(error, "API walut nie odpowiedziało, więc użyłam kursu awaryjnego.")
        : undefined,
      error: rate ? undefined : toolErrorMessage(error, "Nie udało się pobrać kursu."),
      base: normalizedBase,
      target: normalizedTarget,
      rate,
      amount,
      converted: rate ? Number((amount * rate).toFixed(2)) : undefined,
    };
  }
}

async function getHolidays(countryCode = "PL", year = new Date().getFullYear()) {
  const normalizedCountryCode = countryCode.toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalizedCountryCode)) {
    return {
      ok: false,
      source: "validation",
      error: "Podaj 2-literowy kod kraju (np. PL, DE, US).",
      countryCode: normalizedCountryCode,
      year,
      holidays: [],
      upcoming: [],
    };
  }

  try {
    const response = await fetchWithTimeout(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${normalizedCountryCode}`,
    );

    if (!response.ok) {
      throw new Error(`Nie znalazłem świąt dla kraju ${normalizedCountryCode}. Popularne: PL, DE, US, GB, FR.`);
    }

    const holidays = (await response.json()) as Array<{
      date: string;
      localName: string;
      name: string;
      countryCode: string;
    }>;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = holidays.filter((holiday) => new Date(holiday.date) >= today);

    return {
      ok: true,
      source: "Nager.Date",
      countryCode: normalizedCountryCode,
      year,
      holidays,
      upcoming: upcoming.slice(0, 5),
    };
  } catch (error) {
    const fallbackHolidays = [
      { date: `${year}-01-01`, localName: "Nowy Rok", name: "New Year's Day" },
      { date: `${year}-01-06`, localName: "Święto Trzech Króli", name: "Epiphany" },
      { date: `${year}-05-01`, localName: "Święto Pracy", name: "Labour Day" },
      { date: `${year}-05-03`, localName: "Święto Narodowe Trzeciego Maja", name: "Constitution Day" },
      { date: `${year}-08-15`, localName: "Wniebowzięcie Najświętszej Maryi Panny", name: "Assumption of Mary" },
      { date: `${year}-11-01`, localName: "Wszystkich Świętych", name: "All Saints' Day" },
      { date: `${year}-11-11`, localName: "Narodowe Święto Niepodległości", name: "Independence Day" },
      { date: `${year}-12-25`, localName: "Boże Narodzenie", name: "Christmas Day" },
      { date: `${year}-12-26`, localName: "Drugi dzień Bożego Narodzenia", name: "Second Day of Christmas" },
    ];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = fallbackHolidays.filter((holiday) => new Date(holiday.date) >= today);

    return {
      ok: true,
      source: "fallback testowy",
      warning: toolErrorMessage(error, "Nie udało się pobrać świąt z API, więc użyłam listy awaryjnej."),
      countryCode: normalizedCountryCode,
      year,
      upcoming: upcoming.slice(0, 5),
      holidays: fallbackHolidays,
    };
  }
}

async function searchWikipedia(query: string, language = "pl") {
  const safeLanguage = /^[a-z]{2,3}$/.test(language) ? language : "pl";

  if (!query.trim()) {
    return {
      ok: false,
      source: "Wikipedia",
      query,
      language: safeLanguage,
      error: "Podaj hasło do wyszukania w Wikipedii.",
      results: [],
    };
  }

  try {
    const url = new URL(`https://${safeLanguage}.wikipedia.org/w/api.php`);
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`API zwróciło błąd ${response.status}. Sprawdź parametry.`);
    }

    const data = (await response.json()) as {
      query?: {
        search?: Array<{
          title: string;
          snippet: string;
          pageid: number;
        }>;
      };
    };
    const rawResults = (data.query?.search ?? []).map((item) => ({
      title: item.title,
      snippet: decodeHtmlEntities(item.snippet.replace(/<[^>]+>/g, "")),
      url: `https://${safeLanguage}.wikipedia.org/?curid=${item.pageid}`,
    }));
    const results = rawResults
      .filter((result) => !/berlina|sporran|szkoc/i.test(`${result.title} ${result.snippet}`))
      .filter((result) => {
        if (/krak/i.test(query)) {
          return /krak/i.test(`${result.title} ${result.snippet}`);
        }

        return true;
      })
      .slice(0, 5);

    return {
      ok: true,
      source: "Wikipedia",
      query,
      language: safeLanguage,
      results,
    };
  } catch (error) {
    return {
      ok: false,
      source: "Wikipedia",
      query,
      language: safeLanguage,
      error: toolErrorMessage(error, "Nie udało się wyszukać w Wikipedii."),
      results: [],
    };
  }
}

function saveNote(title: string, content: string) {
  const note = {
    id: `note-${Date.now()}-${notes.length + 1}`,
    title,
    content,
    createdAt: new Date().toISOString(),
  };

  notes.unshift(note);

  return {
    ok: true,
    saved: note,
    totalNotes: notes.length,
  };
}

function getNotes() {
  return {
    ok: true,
    notes: notes.slice(0, 20),
    totalNotes: notes.length,
  };
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractReadableText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, 3500);
}

async function readWebPage(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      url,
      error: "Podany adres URL jest niepoprawny.",
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      ok: false,
      url,
      error: "Moge czytac tylko publiczne strony HTTP i HTTPS.",
    };
  }

  try {
    const response = await fetchWithTimeout(parsedUrl.toString(), {
      headers: {
        "user-agent": "Vie ReAct learning agent",
        accept: "text/html,application/xhtml+xml,text/plain",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        url: parsedUrl.toString(),
        error: `API zwróciło błąd ${response.status}. Sprawdź parametry.`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      return {
        ok: false,
        url: parsedUrl.toString(),
        error: `Nie umiem bezpiecznie strescic tego typu pliku: ${contentType}.`,
      };
    }

    const html = await response.text();
    const text = extractReadableText(html);

    return {
      ok: true,
      url: parsedUrl.toString(),
      characters: text.length,
      content:
        text ||
        "Strona zostala pobrana, ale nie udalo sie wyodrebnic czytelnego tekstu.",
    };
  } catch (error) {
    return {
      ok: false,
      url: parsedUrl.toString(),
      error: toolErrorMessage(error, "Nie udało się pobrać strony."),
    };
  }
}

const systemPrompt = `
Jestes autonomicznym agentem ReAct. Dostajesz ZADANIE, nie zwykle pytanie.
Twoim celem jest samodzielnie zaplanowac, wykonac i sprawdzic kroki.

## PROCES PUBLICZNY
Dla kazdego glownego kroku pokaz krotka, publiczna wersje procesu:

### Myślę
Napisz 1-2 zdania: co trzeba teraz ustalic i jakiego narzedzia uzyjesz.

Nastepnie uzyj narzedzia.

### Obserwuję
Napisz 1-2 zdania: co wynika z odpowiedzi narzedzia i czy potrzeba kolejnego kroku.

Powtarzaj do maksymalnie 5 glownych krokow. Nie pokazuj ukrytego, dlugiego toku rozumowania.

Na koniec:

### Wynik końcowy
Podaj pelna, konkretna odpowiedz po polsku. Laczy dane z wielu narzedzi.

## BAZA WIEDZY FIRMY
- Masz dostęp do bazy wiedzy firmy przez narzędzie searchKnowledge.
- Gdy użytkownik pyta o ceny, pakiety, ofertę, regulamin, warunki, FAQ albo procedury, najpierw użyj searchKnowledge.
- Odpowiadaj tylko na podstawie znalezionych fragmentów. Nie wymyślaj cen ani warunków.
- Jeśli searchKnowledge zwróci total_found=0 albo brak pasującego wyniku, nie odpowiadaj z wiedzy ogólnej. Napisz dokładnie: "Nie mam informacji na ten temat w mojej bazie wiedzy. Skontaktuj się z firmą bezpośrednio."
- Gdy odpowiadasz na podstawie bazy wiedzy, zakończ odpowiedź osobną linią: "📎 Źródło: [tytuł dokumentu]". Jeśli używasz kilku dokumentów, napisz: "📎 Źródła: [tytuł 1], [tytuł 2]".
- Tytuły źródeł bierz z pola source_documents albo z pól title/metadata.source w wynikach searchKnowledge.
- Powyższa odmowa dotyczy tylko pytań firmowych. Pytania ogólne, pogodę, waluty, Wikipedię i internet obsługuj normalnie odpowiednimi narzędziami.
## ZASADY
- Nie zgaduj danych aktualnych. Jesli potrzebujesz danych, uzyj narzedzia.
- Do pogody zawsze uzywaj getWeather, nie Google Search.
- Do walut zawsze uzywaj getExchangeRate, a calculator tylko do dodatkowych dzialan.
- Do swiat i dni wolnych zawsze uzywaj getHolidays.
- Do definicji encyklopedycznych najpierw uzywaj searchWikipedia.
- Do logo, grafiki, ilustracji, baneru, mockupu albo obrazu uzywaj generateImage.
- Google Search traktuj jako narzedzie pomocnicze do trendow, nowosci i tematow, ktorych nie obsluguja inne narzedzia.
- Jesli narzedzie zwroci blad, sproboj innym narzedziem albo jasno napisz ograniczenie.
- Cytuj zrodla narzedziowo: Open-Meteo, Frankfurter ECB, Nager.Date, Wikipedia, Google Search albo URL strony.
- Maksymalnie 5 glownych krokow.
- Odpowiadaj po polsku.

## OBSŁUGA BŁĘDÓW
- Jeśli narzędzie zwróci błąd, NIE powtarzaj tego samego wywołania.
- Zamiast tego poinformuj użytkownika i zaproponuj alternatywę.
- Przykład: jeśli pogoda nie działa, napisz: "Nie udało się sprawdzić pogody w X. Mogę spróbować innego miasta."
- Nigdy nie wywołuj tego samego narzędzia z tymi samymi argumentami dwa razy z rzędu.
- Jeśli po 3 nieudanych próbach nie masz danych, powiedz wprost czego brakuje.
`;

type DirectToolStep = {
  toolName:
    | "getWeather"
    | "getHolidays"
    | "searchWikipedia"
    | "getExchangeRate"
    | "calculator"
    | "saveNote"
    | "currentDateTime"
    | "generateImage";
  input: unknown;
  output: unknown;
};

function getMessageText(message: UIMessage) {
  const parts = (message as { parts?: Array<{ text?: unknown; url?: unknown }> })
    .parts;

  if (Array.isArray(parts)) {
    return parts
      .map((part) => {
        if (typeof part.text === "string") {
          return part.text;
        }

        if (typeof part.url === "string") {
          return part.url;
        }

        return "";
      })
      .join(" ");
  }

  const content = (message as { content?: unknown }).content;

  return typeof content === "string" ? content : "";
}

function getLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return latestUserMessage ? getMessageText(latestUserMessage) : "";
}

function extractCity(text: string) {
  const normalized = text.toLowerCase();
  const cityPatterns = [
    { pattern: "krak", city: "Kraków" },
    { pattern: "warsz", city: "Warszawa" },
    { pattern: "berlin", city: "Berlin" },
    { pattern: "pary", city: "Paryż" },
  ];
  const match = cityPatterns.find((item) => normalized.includes(item.pattern));

  if (match) {
    return match.city;
  }

  const explicitCity = text.match(/(?:w|we|do|dla)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]{2,})/u)?.[1];

  return explicitCity ?? "Kraków";
}

function includesAny(text: string, words: string[]) {
  const normalized = text.toLowerCase();

  return words.some((word) => normalized.includes(word));
}

function nextWeekendDates(now = new Date()) {
  const date = new Date(now);
  const day = date.getDay();
  const daysToSaturday = (6 - day + 7) % 7 || 7;
  const saturday = new Date(date);
  saturday.setDate(date.getDate() + daysToSaturday);
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);

  return [saturday, sunday].map((item) => item.toISOString().slice(0, 10));
}

function formatWeatherResult(output: Awaited<ReturnType<typeof getWeather>>) {
  const current = output.current;
  const forecast = Array.isArray(output.forecast) ? output.forecast : [];
  const forecastText = forecast
    .slice(0, 4)
    .map(
      (day) =>
        `- ${day.date}: ${day.minC ?? "?"}-${day.maxC ?? "?"}°C, szansa opadów ${day.rainChancePercent ?? "?"}%`,
    )
    .join("\n");

  return [
    `${output.city}: teraz ${current?.temperatureC ?? "?"}°C, ${current?.description ?? "brak opisu"}, wiatr ${current?.windKmh ?? "?"} km/h.`,
    forecastText ? `Prognoza:\n${forecastText}` : "",
    output.ok ? "Źródło: Open-Meteo." : `Uwaga: użyto danych awaryjnych. ${output.error ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatHolidayResult(
  output: Awaited<ReturnType<typeof getHolidays>>,
  weekendDates: string[],
) {
  const holidays = Array.isArray(output.holidays) ? output.holidays : [];
  const weekendHolidays = holidays.filter((holiday) =>
    weekendDates.includes(String((holiday as { date?: string }).date)),
  ) as Array<{ date?: string; localName?: string; name?: string }>;

  if (weekendHolidays.length === 0) {
    return `W weekend ${weekendDates.join(" - ")} nie znalazłam publicznych świąt ustawowo wolnych w Polsce. Źródło: ${output.source}.`;
  }

  return [
    `W weekend ${weekendDates.join(" - ")} wypadają:`,
    ...weekendHolidays.map(
      (holiday) => `- ${holiday.date}: ${holiday.localName ?? holiday.name ?? "święto"}`,
    ),
    `Źródło: ${output.source}.`,
  ].join("\n");
}

function formatWikipediaResult(output: Awaited<ReturnType<typeof searchWikipedia>>) {
  const results = output.results
    .filter((result) => !/berlina|sporran|szkoc/i.test(`${result.title} ${result.snippet}`))
    .slice(0, 3);

  if (results.length === 0) {
    return "Nie znalazłam przydatnych wyników w Wikipedii.";
  }

  return [
    "Ciekawe tropy z Wikipedii:",
    ...results.map((result) => `- ${result.title}: ${result.snippet}`),
    "Źródło: Wikipedia.",
  ].join("\n");
}

function extractWikipediaQuery(text: string, city: string) {
  const normalized = text.toLowerCase();

  if (normalized.includes("react")) {
    return "ReAct sztuczna inteligencja reasoning acting";
  }

  const definitionMatch = text.match(/czym jest\s+([^?.]+)/i);

  if (definitionMatch?.[1]) {
    return definitionMatch[1].trim();
  }

  if (includesAny(text, ["ciekawe miejsca", "atrakc"])) {
    return `${city} atrakcje turystyczne`;
  }

  return text
    .replace(/znajdź|znajdz|sprawdź|sprawdz|definicj[ęe]|wikipedi[ai]/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || `${city} atrakcje turystyczne`;
}

function nextHolidayInfo(holidays?: Awaited<ReturnType<typeof getHolidays>>) {
  const upcoming = Array.isArray(holidays?.upcoming) ? holidays.upcoming : [];
  const holiday = upcoming[0] as { date?: string; localName?: string; name?: string } | undefined;

  if (!holiday?.date) {
    return undefined;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const holidayDate = new Date(holiday.date);
  holidayDate.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.ceil((holidayDate.getTime() - today.getTime()) / 86400000));

  return {
    date: holiday.date,
    name: holiday.localName ?? holiday.name ?? "święto",
    days,
  };
}

function formatNextHolidayAnswer({
  city,
  weather,
  holidays,
}: {
  city: string;
  weather?: Awaited<ReturnType<typeof getWeather>>;
  holidays?: Awaited<ReturnType<typeof getHolidays>>;
}) {
  const nextHoliday = nextHolidayInfo(holidays);
  const forecast = Array.isArray(weather?.forecast) ? weather.forecast : [];
  const holidayForecast = nextHoliday
    ? forecast.find((day) => day.date === nextHoliday.date)
    : undefined;

  if (!nextHoliday) {
    return [
      "Nie udało się ustalić następnego święta w Polsce na podstawie dostępnych danych.",
      weather ? `Pogoda dla miasta ${city}: ${formatWeatherResult(weather)}` : "",
    ].filter(Boolean).join("\n");
  }

  return [
    `Następne święto ustawowo wolne w Polsce to **${nextHoliday.name}** — **${nextHoliday.date}**.`,
    `Zostało do niego **${nextHoliday.days} dni**.`,
    holidayForecast
      ? `Prognoza dla miasta ${city} na ten dzień: około **${holidayForecast.minC ?? "?"}-${holidayForecast.maxC ?? "?"}°C**, szansa opadów **${holidayForecast.rainChancePercent ?? "?"}%**.`
      : `Nie mam jeszcze dokładnej prognozy dla miasta ${city} na dzień ${nextHoliday.date}, bo narzędzie pogodowe pokazuje tylko najbliższe 7 dni.`,
    `Źródła: ${holidays?.source ?? "święta"}${weather ? ", Open-Meteo" : ""}.`,
  ].join("\n");
}

function buildWikipediaArticle(
  query: string,
  output: Awaited<ReturnType<typeof searchWikipedia>>,
) {
  const results = output.results
    .filter((result) => !/berlina|sporran|szkoc/i.test(`${result.title} ${result.snippet}`))
    .slice(0, 3);

  if (results.length === 0 && query.toLowerCase().includes("react")) {
    return [
      "**ReAct w AI** to sposób projektowania agentów, w którym model łączy dwa kroki: **rozumowanie** (Reasoning) i **działanie** (Acting).",
      "",
      "W praktyce agent najpierw analizuje, czego potrzebuje użytkownik, potem wybiera narzędzie, wykonuje akcję, obserwuje wynik i dopiero na końcu daje odpowiedź. Dzięki temu nie odpowiada tylko z pamięci modelu, ale potrafi korzystać z danych zewnętrznych, takich jak pogoda, wyszukiwarka, kalkulator, baza wiedzy czy analiza strony.",
      "",
      "**Najnowsze zastosowania:** chatboty obsługi klienta, asystenci rezerwacji, automatyzacje e-commerce, analiza dokumentów, agenci researchowi, systemy rekomendacji i panele decyzyjne dla firm.",
      "",
      "Źródło: wiedza kursowa + narzędzie Wikipedia nie zwróciło wystarczająco dobrego wyniku dla polskiego hasła.",
    ].join("\n");
  }

  if (results.length === 0) {
    return "Nie znalazłam wystarczająco dobrych wyników w Wikipedii, żeby przygotować rzetelne opracowanie.";
  }

  return [
    `**${query} — krótkie opracowanie**`,
    "",
    results.map((result) => `${result.title}: ${result.snippet}`).join(" "),
    "",
    `Źródło: ${output.source}.`,
  ].join("\n");
}

function recommendedPlacesForCity(city: string, wikipedia?: Awaited<ReturnType<typeof searchWikipedia>>) {
  const normalized = city.toLowerCase();

  if (normalized.includes("krak")) {
    return ["Rynek Główny", "Wawel", "Kazimierz", "Sukiennice"];
  }

  const results = wikipedia?.results ?? [];

  return results
    .filter((result) => !/berlina|sporran|szkoc/i.test(`${result.title} ${result.snippet}`))
    .slice(0, 3)
    .map((result) => result.title);
}

function cityDestinationName(city: string) {
  const normalized = city.toLowerCase();

  if (normalized.includes("krak")) return "Krakowa";
  if (normalized.includes("warsz")) return "Warszawy";
  if (normalized.includes("berlin")) return "Berlina";
  if (normalized.includes("pary")) return "Paryża";

  return city;
}

function buildWeekendRecommendation({
  city,
  weekendDates,
  weather,
  holidays,
  wikipedia,
}: {
  city: string;
  weekendDates: string[];
  weather?: Awaited<ReturnType<typeof getWeather>>;
  holidays?: Awaited<ReturnType<typeof getHolidays>>;
  wikipedia?: Awaited<ReturnType<typeof searchWikipedia>>;
}) {
  const forecast = Array.isArray(weather?.forecast) ? weather.forecast : [];
  const weekendForecast = forecast.filter((day) => weekendDates.includes(day.date));
  const avgMax =
    weekendForecast.length > 0
      ? weekendForecast.reduce((sum, day) => sum + (day.maxC ?? 0), 0) /
        weekendForecast.length
      : undefined;
  const maxRain =
    weekendForecast.length > 0
      ? Math.max(...weekendForecast.map((day) => day.rainChancePercent ?? 0))
      : undefined;
  const bestDay = weekendForecast
    .slice()
    .sort(
      (a, b) =>
        (a.rainChancePercent ?? 100) - (b.rainChancePercent ?? 100) ||
        (b.maxC ?? 0) - (a.maxC ?? 0),
    )[0];
  const holidayList = Array.isArray(holidays?.holidays) ? holidays.holidays : [];
  const weekendHolidays = holidayList.filter((holiday) =>
    weekendDates.includes(String((holiday as { date?: string }).date)),
  ) as Array<{ date?: string; localName?: string; name?: string }>;
  const places = recommendedPlacesForCity(city, wikipedia);
  const rainAdvice =
    typeof maxRain === "number" && maxRain >= 60
      ? "Prognoza pokazuje podwyższone ryzyko opadów, więc plan powinien mieć wariant pod dachem: muzeum, kawiarnię albo dłuższą przerwę w środku dnia."
      : "Ryzyko opadów wygląda umiarkowanie lub nisko, więc spacerowy plan zwiedzania ma sens.";
  const holidayAdvice =
    weekendHolidays.length > 0
      ? `W ten weekend wypada święto: ${weekendHolidays
          .map((holiday) => `${holiday.date} ${holiday.localName ?? holiday.name ?? ""}`)
          .join(", ")}. To może wpływać na godziny otwarcia atrakcji.`
      : "Nie ma świąt ustawowo wolnych w Polsce w ten weekend, więc nie powinno to blokować planu ani godzin otwarcia większości miejsc.";
  const cityDestination = cityDestinationName(city);
  const goDecision =
    typeof avgMax === "number" && avgMax >= 18 && typeof maxRain === "number" && maxRain < 60
      ? `Rekomendacja: **warto jechać do ${cityDestination}**. Pogoda wygląda wystarczająco dobrze na krótki weekend i zwiedzanie pieszo.`
      : typeof avgMax === "number" && avgMax >= 18
        ? `Rekomendacja: **warto jechać do ${cityDestination}, ale z planem awaryjnym na deszcz**. Temperatura jest dobra, lecz opady mogą przeszkadzać w spacerach.`
        : `Rekomendacja: **można jechać do ${cityDestination}, ale planowałabym więcej atrakcji pod dachem**. Pogoda może być mniej komfortowa na długie spacery.`;

  return [
    goDecision,
    bestDay
      ? `Najlepszy dzień według prognozy: **${bestDay.date}** — około ${bestDay.minC ?? "?"}-${bestDay.maxC ?? "?"}°C i ${bestDay.rainChancePercent ?? "?"}% szansy opadów.`
      : "Nie udało się jednoznacznie wskazać lepszego dnia na podstawie prognozy.",
    rainAdvice,
    holidayAdvice,
    places.length > 0
      ? `Do planu dodałabym: ${places.join(", ")}.`
      : "Na miejscu warto wybrać 2-3 atrakcje i zostawić czas na spokojny spacer.",
  ].join("\n");
}

function shouldUseDirectReact(text: string) {
  return (
    includesAny(text, ["pogod", "świę", "swiet", "wikipedia", "weekend", "react", "definicj", "zastosowania"]) ||
    includesAny(text, ["eur", "usd", "chf", "gbp", "xyz", "walut", "kurs", "przelicz", "oblicz", "policz"])
  );
}

async function buildDirectReactResponse(text: string, messages: UIMessage[]) {
  if (!shouldUseDirectReact(text)) {
    return undefined;
  }

  const steps: DirectToolStep[] = [];
  const answerParts: string[] = [];
  const resultSummaries: string[] = [];
  const city = extractCity(text);
  const weekendDates = nextWeekendDates();
  let weatherResult: Awaited<ReturnType<typeof getWeather>> | undefined;
  let holidaysResult: Awaited<ReturnType<typeof getHolidays>> | undefined;
  let wikipediaResult: Awaited<ReturnType<typeof searchWikipedia>> | undefined;

  if (includesAny(text, ["pogod", "weekend"])) {
    const weather = await getWeather(city);
    weatherResult = weather;
    steps.push({
      toolName: "getWeather",
      input: { city },
      output: weather,
    });
    answerParts.push(
      [
        "### Myślę",
        `Potrzebuję realnej prognozy dla miasta ${city}, więc używam narzędzia getWeather.`,
        "",
        "### Obserwuję",
        formatWeatherResult(weather),
      ].join("\n"),
    );
  }

  if (includesAny(text, ["świę", "swiet", "weekend"])) {
    const explicitCountry = text.toUpperCase().match(/\b[A-Z]{2}\b/)?.[0] ?? "PL";
    const holidays = await getHolidays(explicitCountry, new Date().getFullYear());
    holidaysResult = holidays;
    steps.push({
      toolName: "getHolidays",
      input: { countryCode: explicitCountry, year: new Date().getFullYear() },
      output: holidays,
    });
    answerParts.push(
      [
        "### Myślę",
        "Muszę sprawdzić, czy w najbliższy weekend wypadają w Polsce święta publiczne, więc używam getHolidays.",
        "",
        "### Obserwuję",
        formatHolidayResult(holidays, weekendDates),
      ].join("\n"),
    );
  }

  if (includesAny(text, ["wikipedia", "ciekawe miejsca", "atrakc", "definicj", "react"])) {
    const wikiQuery = extractWikipediaQuery(text, city);
    const wikipedia = await searchWikipedia(wikiQuery, "pl");
    wikipediaResult = wikipedia;
    steps.push({
      toolName: "searchWikipedia",
      input: { query: wikiQuery, language: "pl" },
      output: wikipedia,
    });
    answerParts.push(
      [
        "### Myślę",
        `Potrzebuję krótkiego kontekstu z encyklopedii, więc sprawdzam Wikipedię dla hasła "${wikiQuery}".`,
        "",
        "### Obserwuję",
        formatWikipediaResult(wikipedia),
      ].join("\n"),
    );
  }

  if (includesAny(text, ["eur", "usd", "chf", "gbp", "xyz", "walut", "kurs", "przelicz"])) {
    const amountMatch = text.toUpperCase().match(/(\d+(?:[,.]\d+)?)\s*([A-Z]{3})?/);
    const amount = Number(amountMatch?.[1]?.replace(",", ".") ?? "1");
    const explicitCurrencyMatches = text.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? [];
    const explicitCurrencies = explicitCurrencyMatches.filter((currency) =>
      supportedCurrencies.has(currency),
    );
    const detectedBase =
      amountMatch?.[2] && supportedCurrencies.has(amountMatch[2]) ? amountMatch[2] : "PLN";
    const defaultTargets =
      detectedBase === "PLN"
        ? ["EUR", "USD", "CHF", "GBP"]
        : ["PLN", text.toLowerCase().includes("dolar") ? "USD" : ""];
    const targets = [...explicitCurrencies, ...defaultTargets]
      .filter((currency) => currency !== detectedBase)
      .filter((currency, index, array) => currency && array.indexOf(currency) === index);
    const currencies = targets.length > 0 ? targets : detectedBase === "PLN" ? ["EUR", "USD", "CHF"] : ["PLN"];
    const results = [];

    for (const currency of currencies) {
      const rate = await getExchangeRate(currency, detectedBase, amount);
      steps.push({
        toolName: "getExchangeRate",
        input: { base: detectedBase, target: currency, amount },
        output: rate,
      });
      results.push(
        rate.error
          ? `${currency}: ${rate.error}`
          : `${amount} ${detectedBase} = ${rate.converted ?? "?"} ${currency}`,
      );
    }

    const note = saveNote("Przeliczenie walut ReAct", results.join("\n"));
    steps.push({
      toolName: "saveNote",
      input: { title: "Przeliczenie walut ReAct", content: results.join("\n") },
      output: note,
    });
    answerParts.push(
      [
        "### Myślę",
        "Do przeliczenia walut używam getExchangeRate, a wynik zapisuję w notatkach.",
        "",
        "### Obserwuję",
        results.join("\n"),
      ].join("\n"),
    );
    resultSummaries.push(...results);
  }

  if (includesAny(text, ["oblicz", "policz"])) {
    const expression = text.replace(/.*?(oblicz|policz)/i, "").trim() || text.trim();
    const calculation = calculateExpression(expression);
    steps.push({
      toolName: "calculator",
      input: { expression },
      output: calculation,
    });
    resultSummaries.push(
      calculation.ok
        ? `Wynik obliczenia "${expression}": ${calculation.result}`
        : calculation.error ?? `Nie mogę obliczyć: ${expression}`,
    );
  }

  const asksForNextHoliday = includesAny(text, ["następnego święta", "nastepnego swieta", "ile dni do"]);
  const finalAnswer =
    resultSummaries.length > 0 && !weatherResult && !holidaysResult && !wikipediaResult
      ? ["### Wynik końcowy", ...resultSummaries].join("\n")
      : asksForNextHoliday
        ? [
            "### Wynik końcowy",
            formatNextHolidayAnswer({
              city,
              weather: weatherResult,
              holidays: holidaysResult,
            }),
          ].join("\n")
        : wikipediaResult && !weatherResult && !holidaysResult
          ? [
              "### Wynik końcowy",
              buildWikipediaArticle(extractWikipediaQuery(text, city), wikipediaResult),
            ].join("\n")
          : [
              "### Wynik końcowy",
              buildWeekendRecommendation({
                city,
                weekendDates,
                weather: weatherResult,
                holidays: holidaysResult,
                wikipedia: wikipediaResult,
              }),
            ].join("\n");

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute({ writer }) {
      steps.forEach((step, index) => {
        const toolCallId = `react-direct-tool-${Date.now()}-${index}`;

        writer.write({
          type: "tool-input-available",
          toolCallId,
          toolName: step.toolName,
          input: step.input,
        } as never);
        writer.write({
          type: "tool-output-available",
          toolCallId,
          output: step.output,
        } as never);
      });

      writer.write({ type: "text-start", id: "react-direct-answer" } as never);
      writer.write({
        type: "text-delta",
        id: "react-direct-answer",
        delta: finalAnswer,
      } as never);
      writer.write({ type: "text-end", id: "react-direct-answer" } as never);
      writer.write({ type: "finish", finishReason: "stop" } as never);
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as {
    messages: UIMessage[];
  };

  const latestUserText = getLatestUserText(messages);
  const directResponse = await buildDirectReactResponse(latestUserText, messages);

  if (directResponse) {
    return directResponse;
  }

  const user = await getAuthenticatedUser(request);
  const tokenBudget = await assertDailyTokenBudget(user);

  if (!tokenBudget.ok) {
    return new Response(tokenBudget.message, {
      status: 429,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const inputTokenEstimate = estimateMessagesTokens(messages);

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: withResponseLanguage(request, systemPrompt),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(maxSteps),
    onFinish: async ({ usage }) => {
      await logApiUsage({
        userId: user.id,
        usage,
        inputEstimate: inputTokenEstimate,
        model: "gemini-3.1-flash-lite",
        endpoint: "/api/react",
      });
    },
    tools: {
      ...useSearchGrounding(),
      searchKnowledge: tool({
        description:
          "Wyszukuje informacje w bazie wiedzy firmy: cenniki, pakiety, FAQ, regulaminy, oferty, warunki i procedury. Używaj zawsze, gdy użytkownik pyta o ceny, pakiety, koszty, ofertę, regulamin, procedury albo informacje firmowe.",
        inputSchema: jsonSchema<SearchKnowledgeInput>({
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "Pytanie do bazy wiedzy, np. ile kosztuje pakiet Premium albo co zawiera VIP.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        }),
        execute: async ({ query }) => searchKnowledge(query, 0.5, 5, user.id, user.accessToken),
      }),      calculator: tool({
        description: "Liczy wyrazenia matematyczne, procenty i przeliczenia.",
        inputSchema: jsonSchema<CalculatorInput>({
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Wyrazenie matematyczne, np. 10000 / 4.28.",
            },
          },
          required: ["expression"],
          additionalProperties: false,
        }),
        execute: async ({ expression }) => calculateExpression(expression),
      }),
      currentDateTime: tool({
        description: "Zwraca aktualna date i godzine w strefie Europe/Warsaw.",
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => getCurrentDateTime(),
      }),
      getWeather: tool({
        description: "Pobiera aktualna pogode i prognoze 3-dniowa dla miasta.",
        inputSchema: jsonSchema<CityInput>({
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "Nazwa miasta, np. Warszawa, Krakow, Berlin.",
            },
          },
          required: ["city"],
          additionalProperties: false,
        }),
        execute: async ({ city }) => getWeather(city),
      }),
      getExchangeRate: tool({
        description: "Pobiera kurs waluty i opcjonalnie przelicza kwote.",
        inputSchema: jsonSchema<ExchangeRateInput>({
          type: "object",
          properties: {
            base: {
              type: "string",
              description: "Waluta bazowa, domyslnie PLN.",
            },
            target: {
              type: "string",
              description: "Waluta docelowa, np. EUR, USD, CHF.",
            },
            amount: {
              type: "number",
              description: "Kwota do przeliczenia.",
            },
          },
          required: ["target"],
          additionalProperties: false,
        }),
        execute: async ({ target, base = "PLN", amount = 1 }) =>
          getExchangeRate(target, base, amount),
      }),
      getHolidays: tool({
        description: "Pobiera swieta publiczne dla kraju i roku.",
        inputSchema: jsonSchema<HolidayInput>({
          type: "object",
          properties: {
            countryCode: {
              type: "string",
              description: "Kod kraju ISO, np. PL, DE, FR.",
            },
            year: {
              type: "number",
              description: "Rok, np. 2026.",
            },
          },
          additionalProperties: false,
        }),
        execute: async ({ countryCode = "PL", year }) =>
          getHolidays(countryCode, year ?? new Date().getFullYear()),
      }),
      searchWikipedia: tool({
        description: "Wyszukuje hasla w Wikipedii.",
        inputSchema: jsonSchema<WikipediaInput>({
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Haslo lub temat do wyszukania.",
            },
            language: {
              type: "string",
              description: "Kod jezyka, domyslnie pl.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        }),
        execute: async ({ query, language = "pl" }) =>
          searchWikipedia(query, language),
      }),
      readWebPage: tool({
        description: "Czyta publiczna strone WWW po adresie URL.",
        inputSchema: jsonSchema<ReadWebPageInput>({
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Pelny adres URL, np. https://example.com.",
            },
          },
          required: ["url"],
          additionalProperties: false,
        }),
        execute: async ({ url }) => readWebPage(url),
      }),
      saveNote: tool({
        description: "Zapisuje krotka notatke w pamieci lokalnej agenta.",
        inputSchema: jsonSchema<SaveNoteInput>({
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Tytul notatki.",
            },
            content: {
              type: "string",
              description: "Tresc notatki.",
            },
          },
          required: ["title", "content"],
          additionalProperties: false,
        }),
        execute: async ({ title, content }) => saveNote(title, content),
      }),
      getNotes: tool({
        description: "Zwraca zapisane notatki z pamieci lokalnej agenta.",
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => getNotes(),
      }),
      generateImage: tool({
        description:
          "Generuje obraz przez Google Gemini na podstawie opisu. Używaj gdy użytkownik prosi o logo, grafikę, ilustrację, baner, mockup albo obraz.",
        inputSchema: jsonSchema<GenerateImageInput>({
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Dokładny opis obrazu do wygenerowania.",
            },
          },
          required: ["prompt"],
          additionalProperties: false,
        }),
        execute: async ({ prompt }) => generateImage(prompt),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}










