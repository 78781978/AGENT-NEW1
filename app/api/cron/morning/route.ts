import { google } from "@ai-sdk/google";
import { generateText } from "ai";

import { supabaseRequest } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ToolResult<T> =
  | {
      ok: true;
      data: T;
      source: string;
    }
  | {
      ok: false;
      data: T;
      source: string;
      error: string;
    };

type WeatherData = {
  city: string;
  temperatureC: number | null;
  windKmh: number | null;
  humidityPercent: number | null;
  description: string;
};

type RateData = {
  code: "EUR" | "USD";
  rate: number | null;
  date: string;
};

type NewsItem = {
  title: string;
  source: string;
  url: string;
};

function warsawDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function polishDate(date = new Date()) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "full",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function weekday(date = new Date()) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function weatherDescription(code: number | undefined) {
  if (code === undefined) return "brak kodu pogody";
  if (code === 0) return "bezchmurnie";
  if ([1, 2, 3].includes(code)) return "częściowe zachmurzenie";
  if ([45, 48].includes(code)) return "mgła";
  if ([51, 53, 55, 56, 57].includes(code)) return "mżawka";
  if ([61, 63, 65, 66, 67].includes(code)) return "deszcz";
  if ([71, 73, 75, 77].includes(code)) return "śnieg";
  if ([80, 81, 82].includes(code)) return "przelotne opady";
  if ([95, 96, 99].includes(code)) return "burza";
  return "zmienna pogoda";
}

async function fetchText(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json,text/xml,text/plain,*/*",
        "User-Agent": "Vie-Morning-Briefing/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  return JSON.parse(await fetchText(url, timeoutMs)) as T;
}

async function getWeather(city = "Warszawa"): Promise<ToolResult<WeatherData>> {
  const fallback: WeatherData = {
    city,
    temperatureC: null,
    windKmh: null,
    humidityPercent: null,
    description: "nie udało się pobrać pogody",
  };

  try {
    const data = await fetchJson<{
      current?: {
        temperature_2m?: number;
        wind_speed_10m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
      };
    }>(
      "https://api.open-meteo.com/v1/forecast?latitude=52.2297&longitude=21.0122&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe%2FWarsaw",
    );

    return {
      ok: true,
      source: "Open-Meteo",
      data: {
        city,
        temperatureC: data.current?.temperature_2m ?? null,
        windKmh: data.current?.wind_speed_10m ?? null,
        humidityPercent: data.current?.relative_humidity_2m ?? null,
        description: weatherDescription(data.current?.weather_code),
      },
    };
  } catch (error) {
    return {
      ok: false,
      source: "Open-Meteo",
      data: fallback,
      error: error instanceof Error ? error.message : "Nieznany błąd pogody",
    };
  }
}

async function getExchangeRate(code: RateData["code"]): Promise<ToolResult<RateData>> {
  const fallbackRates: Record<RateData["code"], number> = {
    EUR: 4.28,
    USD: 3.95,
  };

  try {
    const data = await fetchJson<{
      rates?: Array<{ effectiveDate: string; mid: number }>;
    }>(`https://api.nbp.pl/api/exchangerates/rates/a/${code}/?format=json`);

    const latest = data.rates?.[0];
    if (!latest) throw new Error("Brak danych NBP");

    return {
      ok: true,
      source: "NBP",
      data: {
        code,
        rate: latest.mid,
        date: latest.effectiveDate,
      },
    };
  } catch (error) {
    return {
      ok: false,
      source: "Fallback testowy",
      data: {
        code,
        rate: fallbackRates[code],
        date: "wartość testowa",
      },
      error: error instanceof Error ? error.message : "Nieznany błąd walut",
    };
  }
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function getNews(): Promise<ToolResult<NewsItem[]>> {
  try {
    const xml = await fetchText(
      "https://news.google.com/rss/search?q=Polska%20biznes%20technologia&hl=pl&gl=PL&ceid=PL:pl",
    );

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 5)
      .map((match) => {
        const item = match[1];
        const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Wiadomość";
        const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
        const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "Google News";

        return {
          title: decodeXml(title),
          source: decodeXml(source),
          url: decodeXml(link),
        };
      });

    return {
      ok: true,
      source: "Google News RSS",
      data: items,
    };
  } catch (error) {
    return {
      ok: false,
      source: "Google News RSS",
      data: [],
      error: error instanceof Error ? error.message : "Nieznany błąd wiadomości",
    };
  }
}

function fallbackBriefing(input: {
  dateLabel: string;
  weather: WeatherData;
  rates: RateData[];
  news: NewsItem[];
}) {
  const weatherValue =
    input.weather.temperatureC === null
      ? "brak aktualnej temperatury"
      : `${input.weather.temperatureC}°C, ${input.weather.description}`;

  return [
    `# Dzień dobry! Twój briefing na ${input.dateLabel}`,
    "",
    "## Pogoda",
    `Warszawa: ${weatherValue}.`,
    "Ubierz się warstwowo i sprawdź pogodę przed wyjściem, jeśli planujesz dłuższą trasę.",
    "",
    "## Kursy walut",
    ...input.rates.map((rate) => `- ${rate.code}: ${rate.rate ?? "brak danych"} PLN`),
    "",
    "## Wiadomości",
    ...(input.news.length
      ? input.news.map((item) => `- ${item.title} (${item.source})`)
      : ["- Nie udało się pobrać najnowszych wiadomości."]),
    "",
    "## Dzisiejszy dzień",
    `- Dzień tygodnia: ${weekday()}`,
    "- Uwagi: sprawdź najważniejsze zadania i wybierz jedną rzecz, która naprawdę popchnie dzień do przodu.",
    "",
    "## Porada dnia",
    "Zacznij od najważniejszego zadania, zanim dzień rozproszy Cię drobiazgami.",
  ].join("\n");
}

async function generateBriefing(input: {
  dateLabel: string;
  weather: WeatherData;
  rates: RateData[];
  news: NewsItem[];
}) {
  const system = `Jesteś osobistym asystentem. Napisz poranny briefing po polsku w formacie:

# Dzień dobry! Twój briefing na [data]

## Pogoda
[temperatura, opis, co ubrać]

## Kursy walut
- EUR: [kurs] PLN
- USD: [kurs] PLN

## Najważniejsze wiadomości
[3-5 krótkich punktów]

## Dzisiejszy dzień
- Dzień tygodnia: [...]
- Uwagi: [czy dziś święto? dzień wolny?]

## Porada dnia
[Krótka, pozytywna porada na dzień]

Pisz konkretnie, ciepło i bez lania wody. Nie wymyślaj danych, których nie ma w kontekście.`;

  try {
    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system,
      prompt: JSON.stringify(
        {
          date: input.dateLabel,
          weekday: weekday(),
          weather: input.weather,
          rates: input.rates,
          news: input.news,
        },
        null,
        2,
      ),
    });

    return result.text.trim() || fallbackBriefing(input);
  } catch {
    return fallbackBriefing(input);
  }
}

export async function GET() {
  const date = warsawDate();
  const dateLabel = polishDate();
  const [weather, eur, usd, news] = await Promise.all([
    getWeather("Warszawa"),
    getExchangeRate("EUR"),
    getExchangeRate("USD"),
    getNews(),
  ]);

  const briefing = await generateBriefing({
    dateLabel,
    weather: weather.data,
    rates: [eur.data, usd.data],
    news: news.data,
  });

  await supabaseRequest("briefings", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      content: briefing,
      date,
      metadata: {
        weather,
        rates: [eur, usd],
        news,
      },
    }),
  });

  return Response.json({
    success: true,
    date,
    preview: briefing.slice(0, 240),
  });
}
