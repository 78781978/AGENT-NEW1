import { google } from "@ai-sdk/google";
import { searchKnowledge } from "../../../lib/knowledge";
import {
  assertDailyTokenBudget,
  estimateMessagesTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import {
  blockedInputMessage,
  checkRateLimit,
  createSecurityResponse,
  getLatestUserMessageText,
  outputFilterTransform,
  sanitizeMessages,
  securityPrompt,
  validateUserInput,
} from "../../../lib/security";
import { recordUserSecurityEvent } from "../../../lib/security-events";
import { getAuthenticatedUser, supabaseRequest } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";
import {
  convertToModelMessages,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";

export const maxDuration = 30;
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

type ChatMode = "casual" | "expert" | "creative";
type ModelChoice = "flash" | "pro";

const memoryRules = `
## PAMIĘĆ
- Pamiętasz całą rozmowę od początku.
- Nawiązuj do wcześniejszych wiadomości, gdy to istotne.
- Jeśli użytkownik zmienia temat, zaakceptuj to, ale możesz nawiązać do wcześniejszego kontekstu.
- Gdy użytkownik napisze "podsumuj" albo "co ustaliliśmy", streść całą rozmowę w punktach.
- Jeśli użytkownik poda imię, zwracaj się do niego konsekwentnie po imieniu.

## KOMENDA PODSUMOWANIA
Gdy użytkownik napisze "podsumuj" lub "co ustaliliśmy":
1. Wypisz główne tematy rozmowy.
2. Wymień kluczowe ustalenia i odpowiedzi.
3. Zaproponuj, w czym jeszcze możesz pomóc.
Format: numerowana lista.
`;

const basePersona = `
# Vie — Ekspertka automatyzacji AI dla małych firm i e-commerce

## KIM JESTEM
Jestem konsultantką automatyzacji AI z 7-letnim doświadczeniem w e-commerce,
WordPress, WooCommerce i prostych aplikacjach webowych.
Specjalizuję się w chatbotach AI, automatyzacji obsługi klienta oraz
projektowaniu bezpiecznych procesów z API i narzędziami no-code/low-code.
Pracowałam z małymi firmami, sklepami internetowymi, freelancerami i osobami,
które dopiero uczą się wdrażania AI w biznesie.

## JAK ODPOWIADAM

### Struktura każdej odpowiedzi:
1. 📋 **Kontekst** — potwierdzam zrozumienie pytania w 1 zdaniu.
2. 🔍 **Analiza** — daję merytoryczną odpowiedź, maksymalnie 2 akapity.
3. ✅ **Rekomendacja** — wskazuję 1-3 konkretne działania do podjęcia.
4. ❓ **Pytanie** — kończę jednym pytaniem pogłębiającym.

### Zasady:
- ZANIM odpowiem na złożone pytanie, pytam o kontekst.
- Gdy podaję fakty, oznaczam pewność: ✓ pewne, ~ przybliżone, ? do weryfikacji.
- **Pogrubiam** kluczowe terminy przy pierwszym użyciu.
- Używam list numerowanych dla kroków i punktowanych dla opcji.
- Maksymalnie 3 akapity plus rekomendacja.

### Styl:
- Język: polski.
- Ton: profesjonalny, przystępny, ciepły i motywujący.
- Gdy używam terminu branżowego, wyjaśniam go w nawiasie.

## CZEGO NIE ROBIĘ
- Nie odpowiadam na pytania spoza mojej dziedziny. Mówię wprost, że to nie moja specjalizacja, i proponuję, w czym mogę pomóc.
- Nie udaję, że wiem coś, czego nie wiem.
- Nie udzielam porad prawnych, medycznych ani finansowych. W takich tematach odsyłam do odpowiedniego specjalisty.
`;

const prompts: Record<ChatMode, string> = {
  casual: `${basePersona}
Tryb casual: odpowiadaj luźno, jak do znajomej osoby. Krótko, bez żargonu,
z maksymalnie jednym emoji na odpowiedź.
${memoryRules}`,
  expert: `${basePersona}
Tryb ekspert: odpowiadaj formalnie i szczegółowo. Struktura:
Definicja -> Analiza -> Rekomendacja. Podawaj praktyczne założenia i ryzyka.
${memoryRules}`,
  creative: `${basePersona}
Tryb kreatywny: odpowiadaj nieszablonowo. Używaj analogii, metafor i
nieoczywistych perspektyw, ale nadal dawaj konkretne kroki.
${memoryRules}`,
};

function getMode(value: unknown): ChatMode {
  if (value === "expert" || value === "creative" || value === "casual") {
    return value;
  }

  return "casual";
}

function getModel(value: unknown): ModelChoice {
  if (value === "pro" || value === "flash") {
    return value;
  }

  return "flash";
}

async function getUserProfile(userId: string, accessToken: string) {
  const rows = await supabaseRequest<UserProfile[]>(
    `user_profiles?select=id,name,preferences&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {},
    accessToken,
  ).catch(() => []);

  return rows[0] ?? null;
}

const modelIds: Record<ModelChoice, string> = {
  flash: "gemini-3.1-flash-lite",
  pro: "gemini-3.1-flash-lite",
};

const internetRules = `

## INTERNET I ZRODLA
- Gdy pytanie dotyczy aktualnych informacji, cen, wydarzen albo nowosci, korzystaj z Google Search.
- Gdy uzytkownik poda adres URL, uzyj narzedzia readWebPage i stresc tresc strony.
- Gdy uzytkownik prosi o obliczenia, VAT, procenty albo kwoty netto/brutto, uzyj calculator.
- Gdy uzytkownik pyta o date, godzine, dzisiaj albo teraz, uzyj currentDateTime.
- Gdy uzytkownik prosi o logo, grafike, ilustracje, mockup albo post wizualny, uzyj generateImage.
- Gdy tworzysz gotowy post na social media, dodaj odpowiednie emotikonki powiazane z trescia posta. Uzywaj ich naturalnie: 1 emotikonka w naglowku, 2-5 w tresci lub punktach i 1 przy wezwaniu do dzialania. Nie dawaj emotikonek w kazdym zdaniu.
- Przy informacjach z internetu podawaj zrodla jako klikalne linki w formacie Markdown: [nazwa strony](https://adres.pl).
- Jesli strona nie da sie odczytac, powiedz krotko dlaczego i zaproponuj bezpieczny nastepny krok.
`;

const knowledgeRules = `

## BAZA WIEDZY FIRMY
Masz dostęp do bazy wiedzy firmy przez narzędzie searchKnowledge.

ZASADY KORZYSTANIA Z BAZY WIEDZY:
1. Gdy użytkownik pyta o ceny, pakiety, ofertę, regulamin, warunki, FAQ albo procedury — ZAWSZE najpierw użyj searchKnowledge.
2. Odpowiadaj tylko na podstawie znalezionych fragmentów. Nie wymyślaj cen, warunków ani zapisów regulaminu.
3. Jeśli searchKnowledge zwróci total_found=0 albo brak pasującego wyniku, nie odpowiadaj z wiedzy ogólnej. Napisz dokładnie: "Nie mam informacji na ten temat w mojej bazie wiedzy. Skontaktuj się z firmą bezpośrednio."
4. Priorytet narzędzi: pytania o firmę/cennik/FAQ -> searchKnowledge; pytania ogólne -> Google Search lub inne narzędzia; obliczenia -> calculator.
5. Gdy odpowiadasz na podstawie bazy wiedzy, zakończ odpowiedź osobną linią źródła: "📎 Źródło: [tytuł dokumentu]". Jeśli używasz kilku dokumentów, napisz: "📎 Źródła: [tytuł 1], [tytuł 2]".
6. Tytuły źródeł bierz z pola source_documents albo z pól title/metadata.source w wynikach searchKnowledge.
7. Powyższa odmowa dotyczy tylko pytań firmowych. Pytania ogólne, pogodę, waluty, Wikipedię i internet obsługuj normalnie odpowiednimi narzędziami.
`;
type ReadWebPageInput = {
  url: string;
};

type CalculatorInput = {
  expression: string;
};

type GenerateImageInput = {
  prompt: string;
};

type SearchKnowledgeInput = {
  query: string;
};

type UserProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, string> | null;
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

type GenerateGoogleAttemptResult =
  | {
      ok: true;
      image: string;
      provider: string;
      model: string;
      prompt: string;
      text: string;
    }
  | {
      ok: false;
      model: string;
      error: string;
    };

const imageModels = ["gemini-3.1-flash-lite-image"];

function useSearchGrounding(): Record<string, any> {
  if (!isSearchGroundingEnabled) {
    return {};
  }

  return {
    google_search: google.tools.googleSearch({}),
  };
}

function calculateExpression(expression: string) {
  if (!/^[\d\s+\-*/().,%]+$/.test(expression)) {
    return {
      ok: false,
      expression,
      error:
        "Kalkulator przyjmuje tylko liczby oraz znaki + - * / ( ) . , %.",
    };
  }

  const normalizedExpression = expression.replace(/,/g, ".").replace(/%/g, "/100");
  const value = Function(`"use strict"; return (${normalizedExpression});`)();

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

function getGoogleImageApiKey() {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  );
}

function summarizeGoogleImageErrors(errors: string[]) {
  const allErrors = errors.join(" | ");

  if (allErrors.includes("Quota exceeded") && allErrors.includes("limit: 0")) {
    return "Klucz Google został odczytany, ale konto nie ma aktywnego limitu dla generowania obrazów w Gemini API.";
  }

  if (allErrors.includes("Quota exceeded")) {
    return "Klucz Google działa, ale limit generowania obrazów został chwilowo przekroczony.";
  }

  return `Nie udało się wygenerować obrazu przez Google Gemini. Szczegóły: ${allErrors}`;
}

async function generateImageWithGoogleModel(
  model: string,
  apiKey: string,
  prompt: string,
  signal: AbortSignal,
): Promise<GenerateGoogleAttemptResult> {
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
    image: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    provider: "Google Gemini",
    model,
    prompt,
    text: textPart?.text || `Obraz został wygenerowany modelem ${model}.`,
  };
}

async function generateGoogleImage(prompt: string) {
  const apiKey = getGoogleImageApiKey();

  if (!prompt.trim()) {
    return {
      ok: false,
      provider: "Google Gemini",
      model: "brak",
      prompt,
      error: "Podaj opis obrazu do wygenerowania.",
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      provider: "Google Gemini",
      model: "brak klucza",
      prompt,
      error:
        "Brakuje klucza Google w pliku .env.local. Użyj GOOGLE_GENERATIVE_AI_API_KEY albo GOOGLE_API_KEY.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const errors: string[] = [];

  try {
    for (const model of imageModels) {
      const result = await generateImageWithGoogleModel(model, apiKey, prompt, controller.signal);

      if (result.ok) {
        return result;
      }

      errors.push(`${result.model}: ${result.error}`);
    }

    return {
      ok: false,
      provider: "Google Gemini",
      model: "niedostępny",
      prompt,
      error: summarizeGoogleImageErrors(errors),
    };
  } catch (error) {
    return {
      ok: false,
      provider: "Google Gemini",
      model: "błąd",
      prompt,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "Generowanie trwało dłużej niż 30 sekund. Spróbuj ponownie za chwilę."
          : "Nie udało się wygenerować obrazu przez Google Gemini.",
    };
  } finally {
    clearTimeout(timeout);
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
  ).slice(0, 3000);
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "user-agent": "Vie AI learning agent",
        accept: "text/html,application/xhtml+xml,text/plain",
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        url: parsedUrl.toString(),
        error: `Strona zwrocila blad HTTP ${response.status}.`,
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
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Przekroczono limit czasu 5 sekund."
        : "Nie udalo sie pobrac strony.";

    return {
      ok: false,
      url: parsedUrl.toString(),
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const { messages, mode, model, userProfile, longTermMemory } = (await request.json()) as {
    messages: UIMessage[];
    mode?: ChatMode;
    model?: ModelChoice;
    userProfile?: { name?: string | null; preferences?: Record<string, string> };
    longTermMemory?: string;
  };

  const selectedMode = getMode(mode);
  const selectedModel = getModel(model);
  const storedProfile = await getUserProfile(user.id, user.accessToken);
  const profileForPrompt = {
    name: storedProfile?.name || userProfile?.name || null,
    preferences: storedProfile?.preferences || userProfile?.preferences || {},
  };

  const inputValidation = validateUserInput(getLatestUserMessageText(messages));

  if (!inputValidation.ok) {
    await recordUserSecurityEvent(user.id, "blocked_input", user.accessToken);
    return createSecurityResponse(messages, blockedInputMessage);
  }

  const rateLimit = checkRateLimit(user.id);

  if (!rateLimit.ok) {
    await recordUserSecurityEvent(user.id, "rate_limited", user.accessToken);
    return createSecurityResponse(messages, rateLimit.message);
  }

  await recordUserSecurityEvent(user.id, "accepted_message", user.accessToken);

  const safeMessages = sanitizeMessages(messages);
  const tokenBudget = await assertDailyTokenBudget(user);

  if (!tokenBudget.ok) {
    await recordUserSecurityEvent(user.id, "token_limited", user.accessToken);
    return createSecurityResponse(messages, tokenBudget.message);
  }

  const inputTokenEstimate = estimateMessagesTokens(safeMessages);

  const result = streamText({
    model: google(modelIds[selectedModel]),
    experimental_transform: outputFilterTransform(() =>
      recordUserSecurityEvent(user.id, "filtered_output", user.accessToken),
    ),
    system: withResponseLanguage(request, `${prompts[selectedMode]}${internetRules}${knowledgeRules}${securityPrompt}\n\n${
      profileForPrompt.name
        ? `Rozmawiasz z użytkownikiem: ${profileForPrompt.name}. Zwracaj się do niego po imieniu. Jeśli właśnie podał swoje imię, odpowiedz naturalnie: "Miło Cię poznać, ${profileForPrompt.name}! Zapamiętam." Zapamiętane preferencje: ${JSON.stringify(profileForPrompt.preferences ?? {})}.`
        : "Rozmawiasz z użytkownikiem: nieznany. Jeśli to początek rozmowy albo użytkownik nie podał jeszcze imienia, zapytaj grzecznie: jak masz na imię?"
    }\n\n${
      longTermMemory?.trim()
        ? `## PAMIĘĆ OSTATNIEJ ROZMOWY
Masz dostęp do skrótu ostatniej rozmowy z użytkownikiem. Gdy użytkownik pyta, czy coś pamiętasz, o czym rozmawiałyście, co ustaliłyście albo co było w ostatniej rozmowie, użyj poniższej pamięci zamiast odpowiadać ogólnie.

${longTermMemory.slice(0, 6000)}`
        : "## PAMIĘĆ OSTATNIEJ ROZMOWY\nBrak zapisanego skrótu ostatniej rozmowy."
    }`),
    messages: await convertToModelMessages(safeMessages),
    stopWhen: stepCountIs(maxSteps),
    onFinish: async ({ usage }) => {
      await logApiUsage({
        userId: user.id,
        usage,
        inputEstimate: inputTokenEstimate,
        model: modelIds[selectedModel],
        endpoint: "/api/chat",
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
        description:
          "Liczy wyrazenia matematyczne, VAT, procenty, kwoty netto/brutto i proste dzialania.",
        inputSchema: jsonSchema<CalculatorInput>({
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Wyrazenie matematyczne, np. 8500 * 0.23",
            },
          },
          required: ["expression"],
          additionalProperties: false,
        }),
        execute: async ({ expression }) => calculateExpression(expression),
      }),
      currentDateTime: tool({
        description:
          "Zwraca aktualna date i godzine w strefie Europe/Warsaw.",
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => getCurrentDateTime(),
      }),
      readWebPage: tool({
        description:
          "Pobiera i czyta zawartosc strony internetowej. Uzywaj, gdy uzytkownik poda URL lub gdy chcesz przeczytac artykul albo strone znaleziona w wyszukiwarce.",
        inputSchema: jsonSchema<ReadWebPageInput>({
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Pelny adres URL strony, np. https://example.com",
            },
          },
          required: ["url"],
          additionalProperties: false,
        }),
        execute: async ({ url }) => readWebPage(url),
      }),
      generateImage: tool({
        description:
          "Generuje obraz na podstawie opisu. Uzywaj gdy uzytkownik prosi o logo, grafike, ilustracje, mockup albo post wizualny.",
        inputSchema: jsonSchema<GenerateImageInput>({
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Opis obrazu do wygenerowania.",
            },
          },
          required: ["prompt"],
          additionalProperties: false,
        }),
        execute: async ({ prompt }) => generateGoogleImage(prompt),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}









