import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";

export const maxDuration = 45;

type CityInfo = {
  city: string;
  country: string;
  countryCode: string;
  currency: string;
  latitude: number;
  longitude: number;
  language: string;
};

type WeatherResult = Awaited<ReturnType<typeof getWeather>>;
type ExchangeResult = Awaited<ReturnType<typeof getExchangeRate>>;
type HolidaysResult = Awaited<ReturnType<typeof getHolidays>>;
type WikipediaResult = Awaited<ReturnType<typeof searchWikipedia>>;

const cities: CityInfo[] = [
  {
    city: "Berlin",
    country: "Niemcy",
    countryCode: "DE",
    currency: "EUR",
    latitude: 52.52,
    longitude: 13.405,
    language: "pl",
  },
  {
    city: "Paryż",
    country: "Francja",
    countryCode: "FR",
    currency: "EUR",
    latitude: 48.8566,
    longitude: 2.3522,
    language: "pl",
  },
  {
    city: "Praga",
    country: "Czechy",
    countryCode: "CZ",
    currency: "CZK",
    latitude: 50.0755,
    longitude: 14.4378,
    language: "pl",
  },
  {
    city: "Wiedeń",
    country: "Austria",
    countryCode: "AT",
    currency: "EUR",
    latitude: 48.2082,
    longitude: 16.3738,
    language: "pl",
  },
  {
    city: "Londyn",
    country: "Wielka Brytania",
    countryCode: "GB",
    currency: "GBP",
    latitude: 51.5072,
    longitude: -0.1276,
    language: "pl",
  },
  {
    city: "Barcelona",
    country: "Hiszpania",
    countryCode: "ES",
    currency: "EUR",
    latitude: 41.3874,
    longitude: 2.1686,
    language: "pl",
  },
  {
    city: "Lizbona",
    country: "Portugalia",
    countryCode: "PT",
    currency: "EUR",
    latitude: 38.7223,
    longitude: -9.1393,
    language: "pl",
  },
  {
    city: "Tokio",
    country: "Japonia",
    countryCode: "JP",
    currency: "JPY",
    latitude: 35.6762,
    longitude: 139.6503,
    language: "pl",
  },
  {
    city: "Kraków",
    country: "Polska",
    countryCode: "PL",
    currency: "PLN",
    latitude: 50.0647,
    longitude: 19.945,
    language: "pl",
  },
];

const currencyFallbacks: Record<string, number> = {
  EUR: 4.28,
  GBP: 5.05,
  CZK: 0.17,
  JPY: 0.027,
  USD: 3.95,
  PLN: 1,
};

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

function toolErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Timeout — serwer nie odpowiedział w 5 sekund. Spróbuj ponownie.";
  }

  if (error instanceof Error) {
    return `Błąd połączenia: ${error.message}`;
  }

  return fallback;
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getMessageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ");
}

function latestUserText(messages: UIMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  return latest ? getMessageText(latest) : "";
}

function detectCities(text: string) {
  const normalized = normalizeText(text);
  const detected: CityInfo[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/berlin/, "Berlin"],
    [/paryz|paris/, "Paryż"],
    [/prag|praga|prague/, "Praga"],
    [/wieden|wiedniu|vienna/, "Wiedeń"],
    [/londyn|london/, "Londyn"],
    [/barcelon/, "Barcelona"],
    [/liz|lizbon|lisbon/, "Lizbona"],
    [/tokio|tokyo|japon/, "Tokio"],
    [/krakow/, "Kraków"],
  ];

  for (const [pattern, cityName] of patterns) {
    if (pattern.test(normalized)) {
      const city = cities.find((item) => item.city === cityName);

      if (city && !detected.some((item) => item.city === city.city)) {
        detected.push(city);
      }
    }
  }

  return detected;
}

function extractUnknownDestination(text: string) {
  return text.match(/(?:do|w|we)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]{2,})/u)?.[1];
}

function extractBudgetPln(text: string) {
  const normalized = normalizeText(text).replace(/\s+/g, " ");
  const match = normalized.match(/budzet[: ]+(\d+(?:[,.]\d+)?)\s*pln|(\d+(?:[,.]\d+)?)\s*pln/);
  const raw = match?.[1] ?? match?.[2];

  return raw ? Number(raw.replace(",", ".")) : undefined;
}

function weatherCodeDescription(code: number) {
  if (code === 0) return "bezchmurnie";
  if ([1, 2, 3].includes(code)) return "częściowe zachmurzenie";
  if ([45, 48].includes(code)) return "mgła";
  if ([51, 53, 55, 56, 57].includes(code)) return "mżawka";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "deszcz";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "śnieg";
  if ([95, 96, 99].includes(code)) return "burza";

  return "warunki zmienne";
}

function fallbackForecast() {
  return [
    { maxC: 24, minC: 15, rainChancePercent: 35 },
    { maxC: 25, minC: 16, rainChancePercent: 30 },
    { maxC: 22, minC: 14, rainChancePercent: 55 },
  ].map((values, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);

    return {
      date: date.toISOString().slice(0, 10),
      ...values,
    };
  });
}

async function getWeather(city: CityInfo) {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(city.latitude));
    url.searchParams.set("longitude", String(city.longitude));
    url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    url.searchParams.set("timezone", "Europe/Warsaw");
    url.searchParams.set("forecast_days", "5");

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

    return {
      ok: true,
      source: "Open-Meteo",
      city: city.city,
      current: {
        temperatureC: data.current?.temperature_2m,
        windKmh: data.current?.wind_speed_10m,
        description: weatherCodeDescription(data.current?.weather_code ?? -1),
      },
      forecast: data.daily?.time?.map((date, index) => ({
        date,
        maxC: data.daily?.temperature_2m_max?.[index],
        minC: data.daily?.temperature_2m_min?.[index],
        rainChancePercent: data.daily?.precipitation_probability_max?.[index],
      })),
    };
  } catch (error) {
    return {
      ok: false,
      source: "fallback testowy",
      city: city.city,
      error: toolErrorMessage(error, "Nie udało się pobrać pogody."),
      current: {
        temperatureC: 22,
        windKmh: 12,
        description: "dane testowe: umiarkowana pogoda",
      },
      forecast: fallbackForecast(),
    };
  }
}

async function getExchangeRate(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) {
    return {
      ok: false,
      source: "validation",
      error: "Podaj 3-literowy kod waluty (np. EUR, USD).",
      currency,
      plnForOneUnit: currencyFallbacks[currency] ?? 1,
    };
  }

  if (currency === "PLN") {
    return {
      ok: true,
      source: "lokalnie",
      currency,
      plnForOneUnit: 1,
    };
  }

  try {
    const url = new URL(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/`);
    url.searchParams.set("format", "json");
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Waluta ${currency} nie jest dostępna. Popularne: EUR, USD, GBP, CHF.`);
    }

    const data = (await response.json()) as {
      rates?: Array<{
        effectiveDate?: string;
        mid?: number;
      }>;
    };
    const latestRate = data.rates?.[0];
    const rate = latestRate?.mid;

    if (!rate) {
      throw new Error(`Brak kursu ${currency}/PLN`);
    }

    return {
      ok: true,
      source: "NBP",
      date: latestRate.effectiveDate,
      currency,
      plnForOneUnit: Number(rate.toFixed(4)),
    };
  } catch (error) {
    return {
      ok: false,
      source: "fallback testowy",
      error: toolErrorMessage(error, "Nie udało się pobrać kursu."),
      currency,
      plnForOneUnit: currencyFallbacks[currency] ?? 1,
    };
  }
}

async function getHolidays(countryCode: string) {
  const year = new Date().getFullYear();
  const normalizedCountryCode = countryCode.toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalizedCountryCode)) {
    return {
      ok: false,
      source: "validation",
      error: "Podaj 2-literowy kod kraju (np. PL, DE, US).",
      countryCode: normalizedCountryCode,
      year,
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
    }>;
    const today = new Date();
    const upcoming = holidays.filter((holiday) => new Date(holiday.date) >= today).slice(0, 4);

    return {
      ok: true,
      source: "Nager.Date",
      countryCode: normalizedCountryCode,
      year,
      upcoming,
    };
  } catch (error) {
    return {
      ok: false,
      source: "fallback testowy",
      error: toolErrorMessage(error, "Nie udało się pobrać świąt."),
      countryCode: normalizedCountryCode,
      year,
      upcoming: [],
    };
  }
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

async function searchWikipedia(query: string, language = "pl") {
  if (!query.trim()) {
    return {
      ok: false,
      source: "Wikipedia",
      query,
      error: "Podaj hasło do wyszukania w Wikipedii.",
      results: [],
    };
  }

  try {
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
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

    return {
      ok: true,
      source: "Wikipedia",
      query,
      results: (data.query?.search ?? []).slice(0, 4).map((item) => ({
        title: item.title,
        snippet: decodeHtmlEntities(item.snippet.replace(/<[^>]+>/g, "")),
        url: `https://${language}.wikipedia.org/?curid=${item.pageid}`,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      source: "Wikipedia",
      query,
      error: toolErrorMessage(error, "Nie udało się pobrać Wikipedii."),
      results: [],
    };
  }
}

function calculateBudget(budgetPln: number | undefined, exchange: ExchangeResult) {
  if (!budgetPln) {
    return undefined;
  }

  const local = budgetPln / exchange.plnForOneUnit;

  return {
    expression: `${budgetPln} / ${exchange.plnForOneUnit}`,
    result: Number(local.toFixed(2)),
  };
}

function packAdvice(weather: WeatherResult) {
  const rain = weather.forecast?.some((day) => (day.rainChancePercent ?? 0) >= 55);
  const cold = (weather.current.temperatureC ?? 20) < 15;

  return [
    rain ? "lekka kurtka przeciwdeszczowa lub parasol" : "wygodne buty do spacerów",
    cold ? "cieplejsza bluza na wieczór" : "lekka warstwa na wieczór",
    "ładowarka, dokumenty, karta płatnicza i kopia rezerwacji",
  ];
}

function attractions(city: CityInfo, wiki: WikipediaResult) {
  const curated: Record<string, string[]> = {
    Berlin: ["Brama Brandenburska", "Wyspa Muzeów", "Reichstag", "East Side Gallery"],
    Paryż: ["Wieża Eiffla", "Luwr", "Montmartre", "Sekwana"],
    Praga: ["Most Karola", "Hradczany", "Rynek Staromiejski", "Malá Strana"],
    Wiedeń: ["Pałac Schönbrunn", "Katedra św. Szczepana", "Ringstrasse", "Belweder"],
    Londyn: ["British Museum", "Tower Bridge", "Westminster", "Hyde Park"],
    Barcelona: ["Sagrada Família", "Park Güell", "Dzielnica Gotycka", "La Rambla"],
    Lizbona: ["Alfama", "Belém", "Tramwaj 28", "Praça do Comércio"],
    Tokio: ["Shibuya", "Asakusa", "Ueno", "Shinjuku"],
    Kraków: ["Rynek Główny", "Wawel", "Kazimierz", "Sukiennice"],
  };

  return curated[city.city] ?? wiki.results.slice(0, 4).map((item) => item.title);
}

function formatPlan(
  city: CityInfo,
  weather: WeatherResult,
  exchange: ExchangeResult,
  holidays: HolidaysResult,
  wiki: WikipediaResult,
  budgetPln?: number,
) {
  const budget = calculateBudget(budgetPln, exchange);
  const places = attractions(city, wiki);
  const holidayText =
    holidays.upcoming.length > 0
      ? holidays.upcoming.map((item) => `${item.date} — ${item.localName}`).join("\n- ")
      : "Brak najbliższych świąt w danych narzędzia.";
  const budgetText = budget
    ? `${budgetPln} PLN to około **${budget.result} ${city.currency}** przy kursie 1 ${city.currency} = ${exchange.plnForOneUnit} PLN.`
    : `Kurs orientacyjny: **1 ${city.currency} = ${exchange.plnForOneUnit} PLN**.`;

  return [
    `## 🗺️ Plan podróży: ${city.city}`,
    "",
    "### 📋 Podsumowanie",
    `- Destynacja: ${city.city}, ${city.country}`,
    `- Pogoda: ${weather.current.temperatureC ?? "?"}°C, ${weather.current.description}`,
    `- Waluta: 1 ${city.currency} = ${exchange.plnForOneUnit} PLN`,
    "",
    "### 🌤️ Pogoda",
    `Aktualnie: **${weather.current.temperatureC ?? "?"}°C**, ${weather.current.description}, wiatr ${weather.current.windKmh ?? "?"} km/h.`,
    `Spakuj: ${packAdvice(weather).join(", ")}.`,
    "",
    "### 💰 Budżet",
    budgetText,
    "",
    "### 📅 Ważne daty",
    `- ${holidayText}`,
    "Przed wejściem do muzeów i atrakcji sprawdź godziny otwarcia, szczególnie przy świętach lokalnych.",
    "",
    "### 🏛️ Co zobaczyć",
    ...places.map((place) => `- ${place}`),
    "",
    "### ✅ Checklist przed wyjazdem",
    "- Sprawdź dokumenty, ubezpieczenie i rezerwacje.",
    "- Zapisz offline mapę miasta i adres noclegu.",
    "- Przygotuj kartę płatniczą oraz niewielką rezerwę gotówki.",
    "- Sprawdź prognozę ponownie dzień przed wyjazdem.",
    "",
    "Źródła: Open-Meteo, NBP, Nager.Date, Wikipedia.",
  ].join("\n");
}

function recommendationScore(weather: WeatherResult, holidays: HolidaysResult) {
  const temp = weather.current.temperatureC ?? 20;
  const rain = Math.max(...(weather.forecast ?? []).map((day) => day.rainChancePercent ?? 0), 0);
  let score = 4;

  if (temp >= 18 && temp <= 28) score += 1;
  if (rain >= 60) score -= 1;
  if (holidays.upcoming.length > 0) score -= 0.5;

  return Math.max(1, Math.min(5, score));
}

function stars(score: number) {
  return "⭐".repeat(Math.round(score));
}

async function buildSinglePlan(city: CityInfo, budgetPln: number | undefined) {
  const weather = await getWeather(city);
  const exchange = await getExchangeRate(city.currency);
  const holidays = await getHolidays(city.countryCode);
  const wiki = await searchWikipedia(`${city.city} atrakcje turystyczne`, city.language);

  return {
    city,
    weather,
    exchange,
    holidays,
    wiki,
    text: formatPlan(city, weather, exchange, holidays, wiki, budgetPln),
  };
}

async function buildComparisonPlan(destinations: CityInfo[], budgetPln: number | undefined) {
  const plans = await Promise.all(destinations.slice(0, 2).map((city) => buildSinglePlan(city, budgetPln)));
  const rows = plans.map((plan) => {
    const score = recommendationScore(plan.weather, plan.holidays);

    return `| ${plan.city.city} | ${plan.weather.current.temperatureC ?? "?"}°C, ${plan.weather.current.description} | 1 ${plan.city.currency} = ${plan.exchange.plnForOneUnit} PLN | ${plan.holidays.upcoming.length || "brak bliskich"} | ${stars(score)} |`;
  });
  const best = plans
    .slice()
    .sort(
      (a, b) =>
        recommendationScore(b.weather, b.holidays) - recommendationScore(a.weather, a.holidays),
    )[0];

  return [
    `## 🗺️ Porównanie podróży: ${plans.map((plan) => plan.city.city).join(" vs ")}`,
    "",
    "| Miasto | Pogoda | Waluta | Święta | Ocena |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    `### ✅ Rekomendacja`,
    `Wybrałabym **${best.city.city}**, bo ma najlepszy łączny wynik pogody, prostoty budżetu i ryzyka świąt. Jeśli zależy Ci na spokojnym zwiedzaniu, sprawdź jeszcze dostępność noclegów i godziny atrakcji.`,
    "",
    "Źródła: Open-Meteo, NBP, Nager.Date, Wikipedia.",
  ].join("\n");
}

export async function POST(request: Request) {
  const { messages } = (await request.json()) as {
    messages: UIMessage[];
  };
  const text = latestUserText(messages);
  const destinations = detectCities(text);
  const budgetPln = extractBudgetPln(text);
  const unknownDestination = destinations.length === 0 ? extractUnknownDestination(text) : undefined;

  if (unknownDestination) {
    const output = {
      ok: false,
      source: "validation",
      city: unknownDestination,
      error: `Nie znalazłem miasta ${unknownDestination}. Sprawdź pisownię albo podaj pełną nazwę miasta.`,
    };
    const stream = createUIMessageStream({
      originalMessages: messages,
      execute({ writer }) {
        const toolCallId = `travel-tool-${Date.now()}-validation`;
        writer.write({
          type: "tool-input-available",
          toolCallId,
          toolName: "getWeather",
          input: { city: unknownDestination },
        } as never);
        writer.write({
          type: "tool-output-available",
          toolCallId,
          output,
        } as never);
        writer.write({ type: "text-start", id: "travel-answer" } as never);
        writer.write({
          type: "text-delta",
          id: "travel-answer",
          delta: `## Nie mogę przygotować planu podróży\n\n${output.error}\n\nMogę od razu przygotować plan, gdy wpiszesz np. Berlin, Paryż, Praga, Londyn, Barcelona, Lizbona, Tokio albo Kraków.`,
        } as never);
        writer.write({ type: "text-end", id: "travel-answer" } as never);
        writer.write({ type: "finish", finishReason: "stop" } as never);
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  if (destinations.length === 0) {
    const stream = createUIMessageStream({
      originalMessages: messages,
      execute({ writer }) {
        writer.write({ type: "text-start", id: "travel-answer" } as never);
        writer.write({
          type: "text-delta",
          id: "travel-answer",
          delta: "## Brakuje celu podróży\n\nPodaj miasto, do którego jedziesz, np. Berlin, Paryż, Praga, Londyn albo Barcelona.",
        } as never);
        writer.write({ type: "text-end", id: "travel-answer" } as never);
        writer.write({ type: "finish", finishReason: "stop" } as never);
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  const isComparison =
    destinations.length > 1 ||
    (normalizeText(text).includes("porownaj") && destinations.length > 1);
  const selected = isComparison ? destinations.slice(0, 2) : [destinations[0]];
  const steps: Array<{ toolName: string; input: unknown; output: unknown }> = [];
  let answer = "";

  if (isComparison) {
    const plans = [];

    for (const city of selected) {
      const plan = await buildSinglePlan(city, budgetPln);
      plans.push(plan);
      steps.push({ toolName: "getWeather", input: { city: city.city }, output: plan.weather });
      steps.push({ toolName: "getExchangeRate", input: { target: city.currency }, output: plan.exchange });
      steps.push({ toolName: "getHolidays", input: { countryCode: city.countryCode }, output: plan.holidays });
      steps.push({ toolName: "searchWikipedia", input: { query: `${city.city} atrakcje turystyczne` }, output: plan.wiki });
    }

    const rows = plans.map((plan) => {
      const score = recommendationScore(plan.weather, plan.holidays);

      return `| ${plan.city.city} | ${plan.weather.current.temperatureC ?? "?"}°C, ${plan.weather.current.description} | 1 ${plan.city.currency} = ${plan.exchange.plnForOneUnit} PLN | ${plan.holidays.upcoming.length || "brak bliskich"} | ${stars(score)} |`;
    });
    const best = plans
      .slice()
      .sort(
        (a, b) =>
          recommendationScore(b.weather, b.holidays) - recommendationScore(a.weather, a.holidays),
      )[0];

    answer = [
      `## 🗺️ Porównanie podróży: ${plans.map((plan) => plan.city.city).join(" vs ")}`,
      "",
      "| Miasto | Pogoda | Waluta | Święta | Ocena |",
      "|---|---|---|---|---|",
      ...rows,
      "",
      "### ✅ Rekomendacja",
      `Wybrałabym **${best.city.city}**, bo ma najlepszy łączny wynik pogody, prostoty budżetu i ryzyka świąt.`,
      "",
      "Źródła: Open-Meteo, NBP, Nager.Date, Wikipedia.",
    ].join("\n");
  } else {
    const city = selected[0];
    const plan = await buildSinglePlan(city, budgetPln);
    steps.push({ toolName: "getWeather", input: { city: city.city }, output: plan.weather });
    steps.push({ toolName: "getExchangeRate", input: { target: city.currency }, output: plan.exchange });
    steps.push({ toolName: "getHolidays", input: { countryCode: city.countryCode }, output: plan.holidays });
    steps.push({ toolName: "searchWikipedia", input: { query: `${city.city} atrakcje turystyczne` }, output: plan.wiki });

    if (budgetPln) {
      steps.push({
        toolName: "calculator",
        input: { expression: `${budgetPln} / ${plan.exchange.plnForOneUnit}` },
        output: calculateBudget(budgetPln, plan.exchange),
      });
    }

    answer = plan.text;
  }

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute({ writer }) {
      steps.forEach((step, index) => {
        const toolCallId = `travel-tool-${Date.now()}-${index}`;

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
      writer.write({ type: "text-start", id: "travel-answer" } as never);
      writer.write({
        type: "text-delta",
        id: "travel-answer",
        delta: answer,
      } as never);
      writer.write({ type: "text-end", id: "travel-answer" } as never);
      writer.write({ type: "finish", finishReason: "stop" } as never);
    },
  });

  return createUIMessageStreamResponse({ stream });
}

