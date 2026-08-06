export const dynamic = "force-dynamic";

type ToolResult<T> =
  | {
      ok: true;
      data: T;
      updatedAt: string;
      source: string;
    }
  | {
      ok: false;
      data: T;
      updatedAt: string;
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
  code: "EUR" | "USD" | "GBP";
  rate: number | null;
  date: string;
};

type HolidayData = {
  name: string;
  localName: string;
  date: string;
  daysLeft: number;
};

function nowIso() {
  return new Date().toISOString();
}

function polishDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function weatherDescription(code: number | undefined) {
  if (code === undefined) return "Brak kodu pogody";
  if (code === 0) return "Bezchmurnie";
  if ([1, 2, 3].includes(code)) return "Częściowe zachmurzenie";
  if ([45, 48].includes(code)) return "Mgła";
  if ([51, 53, 55, 56, 57].includes(code)) return "Mżawka";
  if ([61, 63, 65, 66, 67].includes(code)) return "Deszcz";
  if ([71, 73, 75, 77].includes(code)) return "Śnieg";
  if ([80, 81, 82].includes(code)) return "Przelotne opady";
  if ([95, 96, 99].includes(code)) return "Burza";
  return "Zmienna pogoda";
}

async function fetchJson<T>(url: string, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Moj-Agent-Dashboard/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getWeather(): Promise<ToolResult<WeatherData>> {
  const fallback: WeatherData = {
    city: "Warszawa",
    temperatureC: null,
    windKmh: null,
    humidityPercent: null,
    description: "Nie udało się pobrać pogody",
  };

  try {
    const weather = await fetchJson<{
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
      data: {
        city: "Warszawa",
        temperatureC: weather.current?.temperature_2m ?? null,
        windKmh: weather.current?.wind_speed_10m ?? null,
        humidityPercent: weather.current?.relative_humidity_2m ?? null,
        description: weatherDescription(weather.current?.weather_code),
      },
      updatedAt: nowIso(),
      source: "Open-Meteo",
    };
  } catch (error) {
    return {
      ok: false,
      data: fallback,
      updatedAt: nowIso(),
      source: "Open-Meteo",
      error: error instanceof Error ? error.message : "Nieznany błąd",
    };
  }
}

async function getRate(code: RateData["code"]): Promise<ToolResult<RateData>> {
  const fallbackRates: Record<RateData["code"], number> = {
    EUR: 4.28,
    USD: 3.95,
    GBP: 5.02,
  };

  try {
    const rate = await fetchJson<{
      code: string;
      rates?: Array<{ effectiveDate: string; mid: number }>;
    }>(`https://api.nbp.pl/api/exchangerates/rates/a/${code}/?format=json`);

    const latest = rate.rates?.[0];
    if (!latest) {
      throw new Error("Brak danych NBP");
    }

    return {
      ok: true,
      data: {
        code,
        rate: latest.mid,
        date: latest.effectiveDate,
      },
      updatedAt: nowIso(),
      source: "NBP",
    };
  } catch (error) {
    return {
      ok: false,
      data: {
        code,
        rate: fallbackRates[code],
        date: "wartość testowa",
      },
      updatedAt: nowIso(),
      source: "Fallback testowy",
      error: error instanceof Error ? error.message : "Nieznany błąd",
    };
  }
}

async function getHolidays(): Promise<ToolResult<HolidayData[]>> {
  try {
    const holidays = await fetchJson<
      Array<{ date: string; localName: string; name: string }>
    >("https://date.nager.at/api/v3/PublicHolidays/2026/PL");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = holidays
      .map((holiday) => {
        const holidayDate = new Date(`${holiday.date}T00:00:00`);
        const daysLeft = Math.ceil(
          (holidayDate.getTime() - today.getTime()) / 86_400_000,
        );

        return {
          name: holiday.name,
          localName: holiday.localName,
          date: holiday.date,
          daysLeft,
        };
      })
      .filter((holiday) => holiday.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);

    return {
      ok: true,
      data: upcoming,
      updatedAt: nowIso(),
      source: "Nager.Date",
    };
  } catch (error) {
    return {
      ok: false,
      data: [],
      updatedAt: nowIso(),
      source: "Nager.Date",
      error: error instanceof Error ? error.message : "Nieznany błąd",
    };
  }
}

export async function GET() {
  const [weather, eur, usd, gbp, holidays] = await Promise.all([
    getWeather(),
    getRate("EUR"),
    getRate("USD"),
    getRate("GBP"),
    getHolidays(),
  ]);

  return Response.json({
    ok: true,
    generatedAt: nowIso(),
    currentDate: {
      iso: nowIso(),
      label: polishDateTime(),
    },
    weather,
    rates: [eur, usd, gbp],
    holidays,
  });
}

