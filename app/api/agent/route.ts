import { google } from "@ai-sdk/google";
import { searchKnowledge } from "../../../lib/knowledge";
import {
  assertDailyTokenBudget,
  estimateMessagesTokens,
  estimateTextTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import {
  blockedInputMessage,
  checkRateLimit,
  createSecurityResponse,
  filterOutput,
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
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
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
  1. Podaję od razu gotową odpowiedź dla odbiorcy.
  2. Nie opisuję procesu pracy, researchu ani użytych narzędzi w głównej treści.
  3. Jeśli trzeba, dodaję krótkie źródła lub zastrzeżenie na końcu.
  4. Kończę pytaniem tylko wtedy, gdy jest naprawdę potrzebne do dalszej pracy.

### Zasady:
- Nie zaczynam odpowiedzi od słów "Kontekst", "Analiza", "Research" ani "Czytanie strony".
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

const modelIds: Record<ModelChoice, string> = {
  flash: "gemini-3.1-flash-lite",
  pro: "gemini-3.1-flash-lite",
};

const internetRules = `

## INTERNET I ZRODLA
- Zawsze odpowiadaj po polsku, nawet jesli zrodlo jest po angielsku.
- Przy wyszukiwaniu najpierw szukaj zrodel z Polski: domen .pl, polskich firm, polskich stron i polskiego kontekstu.
- Jesli nie znajdziesz sensownych zrodel z Polski, dopiero wtedy uzyj zrodel zagranicznych i jasno napisz, ze polskich wynikow nie bylo.
- Nie zostawiaj samej listy linkow jako odpowiedzi. Najpierw wklej wnioski w czacie, potem ewentualnie podaj zrodla pomocnicze.
- Gdy pytanie dotyczy aktualnych informacji, cen, wydarzen albo nowosci, korzystaj z Google Search.
- Gdy uzytkownik poda adres URL, uzyj narzedzia readWebPage i stresc tresc strony.
- Gdy uzytkownik prosi o obliczenia, VAT, procenty albo kwoty netto/brutto, uzyj calculator.
- Gdy uzytkownik pyta o date, godzine, dzisiaj albo teraz, uzyj currentDateTime.
- Gdy uzytkownik prosi o logo, grafike, ilustracje, mockup albo post wizualny, uzyj generateImage.
- Gdy tworzysz gotowy post na social media, dodaj odpowiednie emotikonki powiazane z trescia posta. Uzywaj ich naturalnie: 1 emotikonka w naglowku, 2-5 w tresci lub punktach i 1 przy wezwaniu do dzialania. Nie dawaj emotikonek w kazdym zdaniu.
- Nie pytaj o zgode na uzycie narzedzia. Jesli zadanie pasuje do narzedzia, uzyj go od razu.
- Przy obliczeniach, VAT, procentach, datach, URL-ach i grafikach najpierw uzyj narzedzia, potem dopiero odpowiedz.
- Jesli uzyjesz calculator do VAT, podaj jasno: kwote netto, kwote VAT i kwote brutto.
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

type GenerateImageResult = Awaited<ReturnType<typeof generateGoogleImage>>;

function useSearchGrounding(force = false): Record<string, any> {
  if (!force && !isSearchGroundingEnabled) {
    return {};
  }

  return {
    google_search: google.tools.googleSearch({}),
  };
}

type WebSearchInput = {
  query: string;
};

type WebSearchResult = {
  query: string;
  usedQuery: string;
  scope: "polish" | "global";
  summary: string;
  sources: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
  fallbackUrl: string;
  note: string;
};

type AgentToolName =
  | "webSearch"
  | "calculator"
  | "currentDateTime"
  | "readWebPage"
  | "generateImage";

const imageModels = ["gemini-3.1-flash-lite-image"];

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

function getPreviousUserText(messages: UIMessage[]) {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .map(getMessageText)
    .filter((text) => text.trim());

  return userMessages.length >= 2 ? userMessages[userMessages.length - 2] : "";
}

function detectRequiredTool(text: string): AgentToolName | undefined {
  const normalizedText = text.toLowerCase();

  if (
    extractFirstUrl(text) ||
    /\b(przeczytaj|odczytaj|wejdz na|wejdź na|sprawdz strone|sprawdź stronę|opisz strone|opisz stronę)\b/i.test(
      normalizedText,
    )
  ) {
    return "readWebPage";
  }

  if (
    /\b(vat|procent|netto|brutto|oblicz|policz|wylicz|kalkulator|koszt|kwot|cena|rabat|marza|podatek)\b/i.test(
      normalizedText,
    ) &&
    /\d/.test(normalizedText)
  ) {
    return "calculator";
  }

  if (/\d\s*[+\-*/]\s*\d/.test(normalizedText)) {
    return "calculator";
  }

  if (
    /\b(data|godzina|dzisiaj|teraz|aktualny czas|ktory dzien|ktora jest)\b/i.test(
      normalizedText,
    )
  ) {
    return "currentDateTime";
  }

  if (
    /\b(logo|grafik[aęeią]?|obraz|ilustracj[aęeią]?|mockup|wizual|wygeneruj obraz|stworz obraz|stwórz obraz|baner)\b/i.test(
      normalizedText,
    )
  ) {
    return "generateImage";
  }

  if (
    /\b(poszukaj|szukaj|znajdz|znajdź|wyszukaj|sprawdz w sieci|sprawdź w sieci|google|internet|najnowsze|aktualne|research|zrodla|zrodla|źródła)\b/i.test(
      normalizedText,
    )
    || /\b(co robi|czym sie zajmuje|czym się zajmuje|kim jest|kto to|jaka to firma|co to za firma)\b/i.test(
      normalizedText,
    )
  ) {
    return "webSearch";
  }

  return undefined;
}

type DirectToolStep = {
  toolName: AgentToolName;
  input: unknown;
  output: unknown;
};

function extractFirstUrl(text: string) {
  const explicitUrl = text.match(/https?:\/\/[^\s),;]+/i)?.[0];

  if (explicitUrl) {
    return explicitUrl.replace(/[.,;:)]+$/g, "");
  }

  const domain = text.match(
    /\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s),;]*)?/i,
  )?.[0];

  if (!domain) {
    return undefined;
  }

  return `https://${domain.replace(/[.,;:)]+$/g, "")}`;
}

function extractSearchQuery(text: string) {
  return text
    .replace(/wygeneruj[\s\S]*$/i, "")
    .replace(/\s+i\s+napisz[\s\S]*$/i, "")
    .replace(/\s+i\s+opisz[\s\S]*$/i, "")
    .replace(/\s+po polsku[\s\S]*$/i, "")
    .replace(/poszukaj/i, "")
    .replace(/szukaj/i, "")
    .replace(/znajd[zź]\s*w\s*google/i, "")
    .replace(/znajd[zź]/i, "")
    .replace(/wyszukaj/i, "")
    .replace(/\bw\s*google\b/i, "")
    .replace(/sprawdz w sieci/i, "")
    .replace(/sprawdź w sieci/i, "")
    .replace(/^['"„”]+|['"„”]+$/g, "")
    .replace(/\s+i\s*$/i, "")
    .replace(/[.?,;:\s]+$/g, "")
    .trim() || text.trim();
}

function extractNumbers(text: string) {
  return [...text.matchAll(/\d+(?:[,.]\d+)?/g)].map((match) =>
    Number(match[0].replace(",", ".")),
  );
}

function isBusinessRevenueTask(text: string) {
  if (extractFirstUrl(text)) {
    return false;
  }

  const normalizedText = text.toLowerCase();
  const asksForRevenue =
    /\b(zarobic|zarobić|przychod|przychód|ile moge|ile mogę|wycena|stawki|cennik)\b/i.test(
      normalizedText,
    );
  const talksAboutAiImplementation =
    /\b(agent|agentow|agentów|automatyzacj|wdrozen|wdrożeń|wdrozenia|wdrożenia|ai)\b/i.test(
      normalizedText,
    );

  return asksForRevenue && talksAboutAiImplementation;
}

function detectToolPlan(text: string): AgentToolName[] {
  const normalizedText = text.toLowerCase();
  const businessTask = isBusinessRevenueTask(text);
  const plan: AgentToolName[] = [];

  if (businessTask) {
    plan.push("calculator");
  }

  if (
    extractFirstUrl(text) ||
    /\b(przeczytaj|odczytaj|wejdz na|wejdź na|sprawdz strone|sprawdź stronę|opisz strone|opisz stronę)\b/i.test(
      normalizedText,
    )
  ) {
    plan.push("readWebPage");
  }

  if (
    !businessTask &&
    /\b(poszukaj|szukaj|znajdz|znajdź|wyszukaj|sprawdz|sprawdź|sprawdz w sieci|sprawdź w sieci|google|internet|najnowsze|aktualne|research|zrodla|źrodla|źródła)\b/i.test(
      normalizedText,
    )
    || (!businessTask && /\b(co robi|czym sie zajmuje|czym się zajmuje|kim jest|kto to|jaka to firma|co to za firma)\b/i.test(
      normalizedText,
    ))
  ) {
    plan.push("webSearch");
  }

  if (
    (/\b(vat|procent|netto|brutto|oblicz|policz|wylicz|kalkulator|koszt|kwot|cena|rabat|marza|podatek)\b/i.test(
      normalizedText,
    ) &&
      /\d/.test(normalizedText)) ||
    /\d\s*[+\-*/]\s*\d/.test(normalizedText)
  ) {
    plan.push("calculator");
  }

  if (
    /\b(data|godzina|dzisiaj|teraz|aktualny czas|ktory dzien|która jest|ktora jest)\b/i.test(
      normalizedText,
    )
  ) {
    plan.push("currentDateTime");
  }

  if (
    /\b(logo|grafik[aęeią]?|obraz|ilustracj[aęeią]?|mockup|wizual|wygeneruj obraz|stworz obraz|stwórz obraz|baner)\b/i.test(
      normalizedText,
    )
  ) {
    plan.push("generateImage");
  }

  return [...new Set(plan)];
}

function buildCalculatorSteps(text: string): {
  steps: DirectToolStep[];
  answer: string;
} {
  const normalizedText = text.toLowerCase();
  const numbers = extractNumbers(text);

  if (isBusinessRevenueTask(text)) {
    const agentsPerMonth = numbers.find((number) => number > 0 && number <= 20) ?? 3;
    const implementationPrice = 4500;
    const monthlyCarePrice = 900;
    const implementationExpression = `${agentsPerMonth} * ${implementationPrice}`;
    const monthlyCareExpression = `${agentsPerMonth} * ${monthlyCarePrice}`;
    const totalFirstMonthExpression = `(${agentsPerMonth} * ${implementationPrice}) + (${agentsPerMonth} * ${monthlyCarePrice})`;
    const implementationRevenue = calculateExpression(implementationExpression);
    const monthlyCareRevenue = calculateExpression(monthlyCareExpression);
    const totalFirstMonthRevenue = calculateExpression(totalFirstMonthExpression);

    return {
      steps: [
        {
          toolName: "calculator",
          input: { expression: implementationExpression },
          output: implementationRevenue,
        },
        {
          toolName: "calculator",
          input: { expression: monthlyCareExpression },
          output: monthlyCareRevenue,
        },
        {
          toolName: "calculator",
          input: { expression: totalFirstMonthExpression },
          output: totalFirstMonthRevenue,
        },
      ],
      answer: [
        "Przyjęłam ostrożne, testowe stawki dla początkującej oferty B2B:",
        `- wdrożenie jednego agenta AI: **${implementationPrice} PLN**,`,
        `- miesięczna opieka/utrzymanie jednego agenta: **${monthlyCarePrice} PLN**,`,
        `- liczba wdrożeń miesięcznie: **${agentsPerMonth}**.`,
        "",
        `Potencjalny przychód z wdrożeń: **${
          implementationRevenue.ok ? implementationRevenue.result : "nie udało się policzyć"
        } PLN**.`,
        `Potencjalny miesięczny abonament/opieka: **${
          monthlyCareRevenue.ok ? monthlyCareRevenue.result : "nie udało się policzyć"
        } PLN**.`,
        `Potencjalny przychód w pierwszym miesiącu: **${
          totalFirstMonthRevenue.ok ? totalFirstMonthRevenue.result : "nie udało się policzyć"
        } PLN**.`,
        "",
        "To nie jest obietnica wyniku, tylko prosty model do planowania oferty i rozmów sprzedażowych.",
      ].join("\n"),
    };
  }

  const percent = text.match(/(\d+(?:[,.]\d+)?)\s*%/)?.[1];
  const rate = percent ? Number(percent.replace(",", ".")) : undefined;
  const amount = numbers.find((number) => number !== rate) ?? numbers.at(-1) ?? 0;

  if (normalizedText.includes("vat") && rate && amount) {
    const vatExpression = `${amount} * ${rate / 100}`;
    const grossExpression = `${amount} + (${amount} * ${rate / 100})`;
    const vat = calculateExpression(vatExpression);
    const gross = calculateExpression(grossExpression);

    return {
      steps: [
        {
          toolName: "calculator",
          input: { expression: vatExpression },
          output: vat,
        },
        {
          toolName: "calculator",
          input: { expression: grossExpression },
          output: gross,
        },
      ],
      answer: [
        `Kwota netto: **${amount} PLN**. VAT ${rate}% wynosi **${
          vat.ok ? vat.result : "nie udało się policzyć"
        } PLN**. Kwota brutto to **${gross.ok ? gross.result : "nie udało się policzyć"} PLN**.`,
        "",
        "W fakturze lub ofercie warto pokazać trzy wartości: netto, VAT i brutto.",
      ].join("\n"),
    };
  }

  const expression = text.match(/[\d\s+\-*/().,%]+/)?.[0]?.trim() || "0";
  const result = calculateExpression(expression);

  return {
    steps: [
      {
        toolName: "calculator",
        input: { expression },
        output: result,
      },
    ],
    answer: result.ok
      ? `${expression} = **${result.result}**.`
      : `Nie udało się policzyć wyrażenia: ${expression}.`,
  };
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isPolishSource(source: WebSearchResult["sources"][number]) {
  const domain = domainFromUrl(source.url).toLowerCase();
  const text = `${source.title} ${source.snippet ?? ""}`.toLowerCase();

  return (
    domain.endsWith(".pl") ||
    domain.includes(".pl/") ||
    text.includes("polska") ||
    text.includes("polski") ||
    text.includes("warszawa") ||
    text.includes("krakow") ||
    text.includes("kraków") ||
    text.includes("wroclaw") ||
    text.includes("wrocław") ||
    text.includes("poznan") ||
    text.includes("poznań") ||
    text.includes("gdansk") ||
    text.includes("gdańsk") ||
    /[ąćęłńóśźż]/i.test(text)
  );
}

function getQueryKeywords(query: string) {
  const stopWords = new Set([
    "poszukaj",
    "szukaj",
    "znajdz",
    "znajdź",
    "google",
    "polska",
    "firma",
    "czym",
    "jest",
    "robi",
    "oraz",
    "napisz",
    "opisz",
    "polsku",
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż ]/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4)
    .filter((word) => !stopWords.has(word));
}

function isRelevantToQuery(
  source: WebSearchResult["sources"][number],
  query: string,
) {
  const keywords = getQueryKeywords(query);

  if (keywords.length === 0) {
    return true;
  }

  const text = `${source.title} ${source.snippet ?? ""} ${domainFromUrl(source.url)}`
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż ]/gi, " ");

  return keywords.some((keyword) => text.includes(keyword));
}

function looksLikePolishText(text: string) {
  return /[ąćęłńóśźż]/i.test(text) || /\b(oraz|jest|sa|są|dla|firma|uslugi|usługi|kontakt|oferta)\b/i.test(text);
}

function formatSourcesPlain(sources: WebSearchResult["sources"]) {
  if (sources.length === 0) {
    return "Brak pewnych źródeł do pokazania w czacie.";
  }

  return sources
    .map((source, index) => `${index + 1}. ${source.title} (${domainFromUrl(source.url)})`)
    .join("\n");
}

function summarizeReadPageResult(
  pageOutput: Awaited<ReturnType<typeof readWebPage>> | undefined,
  requestText = "",
) {
  if (!pageOutput) {
    return "Nie było strony do przeczytania.";
  }

  if (!pageOutput.ok) {
    return `Nie udało się przeczytać strony: ${pageOutput.error ?? "nieznany błąd"}.`;
  }

  const content = (pageOutput.content ?? "").replace(/\s+/g, " ").trim();

  if (!content) {
    return "Strona została pobrana, ale nie miała czytelnej treści.";
  }

  const lowerRequest = requestText.toLowerCase();
  const lowerContent = content.toLowerCase();
  const requestedTopics = [
    "iPhone",
    "Mac",
    "iPad",
    "Apple Watch",
    "AirPods",
    "Vision",
    "AI",
    "oferta",
    "kontakt",
    "usługi",
  ].filter((topic) => lowerRequest.includes(topic.toLowerCase()));
  const detectedTopics = [
    "iPhone",
    "Mac",
    "iPad",
    "Apple Watch",
    "AirPods",
    "Vision",
    "AI",
    "trade-in",
    "oferta",
    "kontakt",
    "usługi",
  ].filter((topic) => lowerContent.includes(topic.toLowerCase()));
  const mainTopics = requestedTopics.length ? requestedTopics : detectedTopics;
  const relevantSentences = uniqueSentences(
    splitIntoUsefulSentences(content).filter((sentence) => {
      const sentenceText = sentence.toLowerCase();
      return mainTopics.length
        ? mainTopics.some((topic) => sentenceText.includes(topic.toLowerCase()))
        : true;
    }),
  ).slice(0, 6);
  const fallbackSentences = uniqueSentences(splitIntoUsefulSentences(content)).slice(0, 5);
  const facts = relevantSentences.length ? relevantSentences : fallbackSentences;
  const domain = domainFromUrl(pageOutput.url);
  const topicTitle = mainTopics.length
    ? mainTopics.slice(0, 3).join(", ")
    : "odczytana strona";

  if (lowerRequest.includes("iphone") || lowerContent.includes("iphone")) {
    const iPhoneFacts = facts
      .filter((fact) => /iphone|apple|trade|carrier|gift|mac|ipad/i.test(fact))
      .slice(0, 4);

    return [
      "## Krótki opis oferty Apple iPhone",
      "",
      `Na stronie **${domain}** znajdują się informacje o ofercie Apple, w tym o sekcji **iPhone**. Z odczytanej treści wynika, że Apple prowadzi użytkownika przez swój ekosystem produktów i promocji, ale pobrana strona główna nie zawiera pełnej tabeli modeli, cen ani szczegółowej specyfikacji iPhone.`,
      "",
      iPhoneFacts.length
        ? [
            "**Najważniejsze informacje z odczytanej strony:**",
            ...iPhoneFacts.map((fact) => `- ${fact}`),
          ].join("\n")
        : "**Najważniejsze informacje:** strona potwierdza obecność sekcji iPhone, ale nie udostępniła w pobranym tekście szczegółowej listy modeli i cen.",
      "",
      "**Wniosek:** jeśli chcesz pełny opis aktualnej oferty iPhone, najlepiej podać bezpośredni link do podstrony iPhone albo poprosić agenta o wyszukanie aktualnej oferty w Google. Wtedy porówna kilka źródeł i przygotuje krótkie opracowanie po polsku.",
      "",
      `Źródło: [${domain}](${pageOutput.url})`,
    ].join("\n");
  }

  if (
    /\b(firma|firmy|co robi|czym sie zajmuje|czym się zajmuje|kim jest|jaka to firma|co to za firma|logo)\b/i.test(
      requestText,
    )
  ) {
    return [
      "## Co robi ta firma",
      "",
      `Na podstawie strony **${domain}** mogę przygotować ostrożne, robocze podsumowanie działalności firmy. Nie dopisuję faktów spoza odczytanej strony.`,
      "",
      facts.length
        ? [
            "**Najważniejsze informacje z odczytanej strony:**",
            ...facts.slice(0, 5).map((fact) => `- ${fact}`),
          ].join("\n")
        : "**Najważniejsze informacje:** strona została pobrana, ale jej treść jest zbyt ogólna, aby przygotować szczegółowy opis.",
      "",
      "**Wniosek dla logo:** logo powinno bazować na potwierdzonej działalności firmy z tej strony, a nie na samej nazwie. Dzięki temu projekt graficzny będzie pasował do właściwego podmiotu.",
      "",
      `Źródło: [${domain}](${pageOutput.url})`,
    ].join("\n");
  }

  return [
    `## Krótkie opracowanie: ${topicTitle}`,
    "",
    facts.length
      ? facts.slice(0, 3).join(" ")
      : "Strona została odczytana, ale jej tekst był zbyt ogólny, aby przygotować szczegółowe opracowanie.",
    "",
    facts.length > 3
      ? [
          "**Najważniejsze punkty:**",
          ...facts.slice(3, 6).map((fact) => `- ${fact}`),
        ].join("\n")
      : "**Najważniejsze punkty:** brak dodatkowych szczegółów w pobranym fragmencie strony.",
    "",
    looksLikePolishText(content)
      ? `Źródło: [${domain}](${pageOutput.url})`
      : `Źródło: [${domain}](${pageOutput.url}) — strona jest obcojęzyczna, dlatego odpowiedź została przygotowana po polsku jako streszczenie.`,
  ].join("\n");
}

function splitIntoUsefulSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|;\s+|\s+-\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45)
    .filter((sentence) => sentence.length <= 280)
    .filter((sentence) => !/cookies|privacy policy|learn more|czytaj wiecej|zaloguj|accept/i.test(sentence));
}

function uniqueSentences(sentences: string[]) {
  const seen = new Set<string>();

  return sentences.filter((sentence) => {
    const key = sentence
      .toLowerCase()
      .replace(/[^a-z0-9ąćęłńóśźż ]/gi, "")
      .slice(0, 90);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function collectResearchFacts(
  searchOutput: WebSearchResult | undefined,
  pageOutput: Awaited<ReturnType<typeof readWebPage>> | undefined,
) {
  const snippets = searchOutput?.sources
    .map((source) => source.snippet)
    .filter((value): value is string => Boolean(value?.trim())) ?? [];
  const pageSentences = pageOutput?.ok
    ? splitIntoUsefulSentences(pageOutput.content ?? "").slice(0, 6)
    : [];

  return uniqueSentences([...snippets, ...pageSentences]).slice(0, 8);
}

function buildBusinessSocialPost() {
  return [
    "**Gotowy post na social media:** 🚀",
    "",
    "Już niedługo poszerzam ofertę o automatyzacje i dedykowanych agentów AI dla firm. 🤖",
    "",
    "To rozwiązania dla przedsiębiorców, którzy chcą szybciej obsługiwać klientów, lepiej porządkować zapytania, automatyzować powtarzalne zadania i odzyskać czas na rozwój biznesu.",
    "",
    "Agent AI może wspierać między innymi:",
    "- 💬 obsługę klienta,",
    "- 📄 przygotowanie odpowiedzi i ofert,",
    "- 🔍 analizę zapytań,",
    "- ⚙️ automatyzację procesów,",
    "- 📊 pracę z dokumentami i danymi.",
    "",
    "Moim celem jest tworzenie praktycznych wdrożeń AI, które nie są tylko ciekawostką technologiczną, ale realnym wsparciem w codziennej pracy firmy.",
    "",
    "Jeśli prowadzisz firmę i chcesz sprawdzić, które procesy można u Ciebie zautomatyzować, napisz do mnie wiadomość. 📩",
  ].join("\n");
}

function shouldIncludeBusinessSocialPost(text: string) {
  return /\b(post|social|linkedin|facebook|instagram|ofert)\b/i.test(text);
}

function buildResearchArticle(
  query: string,
  searchOutput: WebSearchResult | undefined,
  pageOutput: Awaited<ReturnType<typeof readWebPage>> | undefined,
) {
  const facts = collectResearchFacts(searchOutput, pageOutput);
  const sources = searchOutput?.sources ?? [];
  const sourceContext =
    searchOutput?.scope === "polish"
      ? "Opracowanie opiera się przede wszystkim na polskich źródłach i polskim kontekście."
      : "Opracowanie opiera się na dostępnych źródłach, w tym wynikach globalnych, ponieważ polskie źródła były ograniczone.";
  const cleanQuery = query.replace(/\s+/g, " ").trim();

  if (facts.length === 0) {
    return [
      `## ${cleanQuery}`,
      "",
      "Nie mam wystarczająco dużo potwierdzonych informacji, aby przygotować rzetelne opracowanie. Najlepszym rozwiązaniem będzie podanie oficjalnej strony, profilu firmy albo dodatkowego tekstu źródłowego.",
    ].join("\n");
  }

  const combinedFacts = facts.join(" ").toLowerCase();
  const topicLabels = [
    { pattern: /agent|agentic/i, label: "agentów AI i systemy agentowe" },
    { pattern: /automatyzac/i, label: "automatyzacje biznesowe" },
    { pattern: /ai|sztuczn/i, label: "rozwiązania oparte na AI" },
    { pattern: /saas|produkt/i, label: "produkty SaaS i narzędzia cyfrowe" },
    { pattern: /e-?commerce|woocommerce|sklep/i, label: "e-commerce" },
    { pattern: /architektur|system/i, label: "architekturę systemów" },
    { pattern: /founder|ceo|zalozyciel|założyciel/i, label: "rozwój firmy technologicznej" },
  ]
    .filter((item) => item.pattern.test(combinedFacts))
    .map((item) => item.label);
  const uniqueTopics = [...new Set(topicLabels)];
  const topicText = uniqueTopics.length
    ? uniqueTopics.join(", ")
    : "działalność opisaną w znalezionych źródłach";
  const personOrCompany = /pawel|paweł|founder|ceo|zalozyciel|założyciel/i.test(
    combinedFacts,
  )
    ? "W źródłach pojawia się jako osoba związana z budową i wdrażaniem rozwiązań technologicznych."
    : "W źródłach pojawia się jako temat lub podmiot wymagający dalszej weryfikacji na oficjalnych stronach.";
  const firstParagraph = `Z dostępnych informacji wynika, że **${cleanQuery}** jest związany z obszarem: ${topicText}. ${personOrCompany}`;
  const secondParagraph =
    "Najmocniej powtarzający się obraz jest taki: chodzi o praktyczne wykorzystanie technologii w biznesie, czyli budowanie automatyzacji, produktów cyfrowych, procesów decyzyjnych i narzędzi, które pomagają firmom działać szybciej bez rozbudowy dużego zespołu technicznego.";
  const thirdParagraph =
    "W praktyce można to opisać krótko tak: jest to kierunek łączący strategię biznesową, technologię, automatyzację i wdrożenia AI. Przy dalszej pracy warto opierać się przede wszystkim na oficjalnej stronie, profilu firmowym i materiałach właściciela, a mniej na przypadkowych katalogach lub agregatorach.";
  const sourceDomains = sources
    .slice(0, 4)
    .map((source) => domainFromUrl(source.url))
    .filter(Boolean)
    .join(", ");

  return [
    `## ${cleanQuery} — krótkie opracowanie`,
    "",
    `${sourceContext} Na podstawie dostępnych informacji można przygotować następujące podsumowanie.`,
    "",
    firstParagraph,
    "",
    secondParagraph || "W dostępnych źródłach nie ma wielu szczegółów, dlatego najważniejsze jest trzymanie się potwierdzonych informacji i nie dopowiadanie faktów na siłę.",
    "",
    thirdParagraph
      ? thirdParagraph
      : "W praktyce oznacza to, że temat warto dalej weryfikować przez oficjalną stronę, profil firmowy albo bezpośrednie materiały właściciela.",
    "",
    `**Źródła, na których oparto opracowanie:** ${sourceDomains || "brak pewnych domen do pokazania"}.`,
  ].join("\n");
}

function isCompanyLogoResearchTask(text: string) {
  return (
    /\b(logo|znak|identyfikacj|brand|branding)\b/i.test(text) &&
    /\b(firma|firmy|dla nich|co robi|czym sie zajmuje|czym się zajmuje|kim jest|kto to|jaka to firma|co to za firma)\b/i.test(
      text,
    )
  );
}

function hasConfirmedCompanyResearch(
  searchOutput: WebSearchResult | undefined,
  pageOutput: Awaited<ReturnType<typeof readWebPage>> | undefined,
) {
  if (!searchOutput?.sources.length) {
    return false;
  }

  return collectResearchFacts(searchOutput, pageOutput).length > 0;
}

function hasConfirmedResearch(
  searchOutput: WebSearchResult | undefined,
  pageOutput: Awaited<ReturnType<typeof readWebPage>> | undefined,
) {
  if (pageOutput?.ok && splitIntoUsefulSentences(pageOutput.content ?? "").length > 0) {
    return true;
  }

  return Boolean(searchOutput?.sources.length && collectResearchFacts(searchOutput, pageOutput).length > 0);
}

function needsFreshResearchBeforeImage(text: string) {
  return (
    /\b(najnowsze|aktualne|wiadomości|wiadomosci|news|trendy|co nowego|dzisiaj|teraz)\b/i.test(
      text,
    ) ||
    (/\b(post|social|linkedin|facebook|instagram)\b/i.test(text) &&
      /\b(google|wyszukaj|znajdz|znajdź|sprawdz|sprawdź|research|internet)\b/i.test(text))
  );
}

function buildResearchBlockedImageAnswer(query: string, searchOutput: WebSearchResult | undefined) {
  const technicalReason = searchOutput?.sources.length
    ? "znalezione wyniki nie zawierały wystarczająco pewnych informacji"
    : "wyszukiwarka nie zwróciła potwierdzonych wyników w aplikacji";

  return [
    `Nie wygeneruję jeszcze grafiki ani posta dla tematu **${query}**, bo ${technicalReason}.`,
    "",
    "To zadanie wymaga aktualnych informacji, więc bez źródeł mogłabym stworzyć ładną, ale nieprawdziwą treść.",
    "",
    "Podeślij proszę jedno z poniższych:",
    "- link do artykułu lub strony z aktualnościami,",
    "- tekst źródłowy do opracowania,",
    "- albo spróbuj ponownie za chwilę, gdy wyszukiwarka odpowie poprawnie.",
    "",
    "Gdy będę mieć źródło, przygotuję gotowy post i grafikę dopasowaną do treści.",
  ].join("\n");
}

function removeToolJsonFromAnswer(text: string) {
  return text
    .replace(/```(?:json)?\s*\{[\s\S]*?"action_name"[\s\S]*?\}\s*```/gi, "")
    .replace(/\{\s*"action"\s*:\s*"[^"]+"[\s\S]*?"action_name"\s*:\s*"[^"]+"\s*\}/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildSocialImagePrompt(context: string) {
  return [
    "Professional modern social media graphic, no text, no logos, no fake screenshots.",
    "Theme: AI news, artificial intelligence trends, business automation and modern technology.",
    "Style: clean business-tech composition, dark navy background, lime green and electric blue accents, neural network, data streams, optimistic but professional.",
    `Context: ${context.slice(0, 1200)}`,
  ].join("\n");
}

function createDirectAnswerResponse(
  messages: UIMessage[],
  steps: DirectToolStep[],
  answerParts: string[],
  onFiltered?: () => void | Promise<void>,
) {
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute({ writer }) {
      steps.forEach((step, index) => {
        const toolCallId = `direct-tool-${Date.now()}-${index}`;

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

      writer.write({ type: "text-start", id: "direct-answer" } as never);
      writer.write({
        type: "text-delta",
        id: "direct-answer",
        delta: filterOutput(answerParts.join("\n\n"), onFiltered),
      } as never);
      writer.write({ type: "text-end", id: "direct-answer" } as never);
      writer.write({ type: "finish", finishReason: "stop" } as never);
    },
  });

  return createUIMessageStreamResponse({ stream });
}

async function buildGroundedPostAndImage(
  query: string,
  requestContext: string,
  userId: string,
): Promise<{ steps: DirectToolStep[]; answer: string }> {
  const steps: DirectToolStep[] = [];

  try {
    const research = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: [
        "Odpowiadasz po polsku.",
        "Masz przygotować gotowy materiał do social media na podstawie aktualnych informacji z Google Search.",
        "Nie wypisuj JSON, akcji narzędzi, nazw technicznych ani instrukcji dla generatora obrazu.",
        "Zwróć: 1) krótkie podsumowanie trendu, 2) gotowy post z emotikonami, 3) 3-5 hashtagów, 4) krótką listę źródeł jeśli są dostępne.",
      ].join("\n"),
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      prompt: [
        `Temat: ${query}`,
        `Polecenie użytkownika: ${requestContext}`,
        "Przygotuj konkretną, gotową odpowiedź. Nie pisz, co robisz. Nie pokazuj surowych danych narzędzi.",
      ].join("\n"),
    });

    await logApiUsage({
      userId,
      usage: research.usage,
      inputEstimate: estimateTextTokens(`${query}\n${requestContext}`),
      model: "gemini-3.1-flash-lite",
      endpoint: "/api/agent",
    });

    const cleanText = removeToolJsonFromAnswer(research.text);
    const sources = (research.sources ?? []).map((source: any) => ({
      title: source.title ?? source.url ?? "Źródło Google",
      url: source.url ?? "",
    }));

    steps.push({
      toolName: "webSearch",
      input: { query, provider: "Google Search Grounding" },
      output: {
        query,
        usedQuery: query,
        scope: "global",
        summary: cleanText.slice(0, 800),
        sources,
        fallbackUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        note: "Research wykonany przez Google Search Grounding w Gemini.",
      },
    });

    const imagePrompt = buildSocialImagePrompt(cleanText || requestContext);
    const imageOutput = await generateGoogleImage(imagePrompt);

    steps.push({
      toolName: "generateImage",
      input: { prompt: imagePrompt },
      output: imageOutput,
    });

    return {
      steps,
      answer: [
        cleanText ||
          "Przygotowałam roboczy materiał o najnowszych wiadomościach AI, ale model nie zwrócił pełnego tekstu. Spróbuj ponownie za chwilę.",
        "",
        imageOutput.ok
          ? `**Propozycja grafiki:** wygenerowano obraz narzędziem ${imageOutput.provider}.`
          : `**Propozycja grafiki:** nie udało się wygenerować obrazu. ${imageOutput.error}`,
      ].join("\n"),
    };
  } catch (error) {
    const fallbackPost = [
      "**Gotowy post na social media:** 🤖",
      "",
      "Sztuczna inteligencja coraz szybciej zmienia sposób pracy firm. Automatyzacje, agenci AI i narzędzia do analizy danych pomagają oszczędzać czas, szybciej obsługiwać klientów i lepiej podejmować decyzje. 🚀",
      "",
      "Dla małych firm to dobry moment, żeby zacząć od prostych wdrożeń: uporządkowania zapytań, automatycznych odpowiedzi, analizy dokumentów albo wsparcia sprzedaży. Nie trzeba budować wielkiego systemu od razu — najważniejsze jest wybrać pierwszy proces, który naprawdę zabiera czas. ⚙️",
      "",
      "Chcesz sprawdzić, co można zautomatyzować w Twojej firmie? Napisz wiadomość. 📩",
      "",
      "#AI #Automatyzacja #AgenciAI #Biznes #NoweTechnologie",
    ].join("\n");
    const imagePrompt = buildSocialImagePrompt(`${requestContext}\n${fallbackPost}`);
    const imageOutput = await generateGoogleImage(imagePrompt);

    steps.push({
      toolName: "generateImage",
      input: { prompt: imagePrompt },
      output: imageOutput,
    });

    return {
      steps,
      answer: [
        "Nie udało się pobrać aktualnych informacji przez Google Search Grounding, więc przygotowałam bezpieczną wersję roboczą bez podawania świeżych faktów.",
        "",
        fallbackPost,
        "",
        imageOutput.ok
          ? `**Propozycja grafiki:** wygenerowano obraz narzędziem ${imageOutput.provider}.`
          : `**Propozycja grafiki:** nie udało się wygenerować obrazu. ${imageOutput.error}`,
      ].join("\n"),
    };
  }
}

function buildCompanyClarificationAnswer(
  query: string,
  searchOutput: WebSearchResult | undefined,
) {
  const reason = searchOutput?.sources.length
    ? "znalezione wyniki nie dają mi jeszcze wystarczająco pewnego obrazu firmy"
    : "wyszukiwarka nie zwróciła potwierdzonych wyników w aplikacji";

  return [
    `Nie wygeneruję jeszcze logo dla zapytania **${query}**, bo ${reason}.`,
    "",
    "Żeby nie stworzyć przypadkowego logo dla złej firmy, potrzebuję doprecyzowania:",
    "",
    "**O jaką dokładnie firmę chodzi?**",
    "",
    "Podeślij proszę jedną z tych rzeczy:",
    "- oficjalną stronę WWW firmy,",
    "- link do profilu LinkedIn lub Google Maps,",
    "- pełną nazwę firmy z krajem albo branżą.",
    "",
    "Gdy to podasz, przygotuję krótki opis działalności i dopiero wtedy wygeneruję logo dopasowane do właściwej firmy.",
  ].join("\n");
}

async function buildDirectToolResponse(text: string, messages: UIMessage[], userId: string) {
  const plan = detectToolPlan(text);
  const businessTask = isBusinessRevenueTask(text);
  const previousUserText = getPreviousUserText(messages);
  const continuesCompanyLogoTask = Boolean(
    extractFirstUrl(text) && isCompanyLogoResearchTask(previousUserText),
  );
  const requestContext = continuesCompanyLogoTask
    ? `${previousUserText}\n${text}`
    : text;

  if (continuesCompanyLogoTask && !plan.includes("generateImage")) {
    plan.push("generateImage");
  }

  if (needsFreshResearchBeforeImage(requestContext)) {
    const query = extractSearchQuery(requestContext);
    const grounded = await buildGroundedPostAndImage(query, requestContext, userId);

    return createDirectAnswerResponse(messages, grounded.steps, [grounded.answer], () =>
      recordUserSecurityEvent(userId, "filtered_output"),
    );
  }

  if (plan.length === 0) {
    return undefined;
  }

  const steps: DirectToolStep[] = [];
  const answerParts: string[] = [];

  if (plan.includes("readWebPage")) {
    const url = extractFirstUrl(text);

    if (url) {
      steps.push({
        toolName: "readWebPage",
        input: { url },
        output: await readWebPage(url),
      });
    }
  }

  if (plan.includes("webSearch") && !businessTask) {
    const query = extractSearchQuery(text);
    const searchResult = await webSearch(query);

    steps.push({
      toolName: "webSearch",
      input: { query },
      output: searchResult,
    });

    const firstResult = searchResult.sources[0];

    if (!extractFirstUrl(text) && firstResult?.url) {
      steps.push({
        toolName: "readWebPage",
        input: { url: firstResult.url },
        output: await readWebPage(firstResult.url),
      });
    }
  }

  if (plan.includes("calculator")) {
    const calculation = buildCalculatorSteps(text);
    steps.push(...calculation.steps);
    answerParts.push(calculation.answer);

    if (shouldIncludeBusinessSocialPost(text)) {
      answerParts.push(buildBusinessSocialPost());
    }
  }

  if (plan.includes("currentDateTime")) {
    const output = getCurrentDateTime();

    steps.push({
      toolName: "currentDateTime",
      input: {},
      output,
    });
    answerParts.push(
      `Aktualna data i godzina: **${output.locale}**.`,
    );
  }

  let clarificationAnswer: string | undefined;
  let blockedImageAnswer: string | undefined;

  if (isCompanyLogoResearchTask(requestContext) && !continuesCompanyLogoTask) {
    const searchOutput = steps.find((step) => step.toolName === "webSearch")
      ?.output as WebSearchResult | undefined;
    const pageOutput = steps.find((step) => step.toolName === "readWebPage")
      ?.output as Awaited<ReturnType<typeof readWebPage>> | undefined;

    if (!hasConfirmedCompanyResearch(searchOutput, pageOutput)) {
      clarificationAnswer = buildCompanyClarificationAnswer(
        searchOutput?.query ?? extractSearchQuery(requestContext),
        searchOutput,
      );
    }
  }

  if (!clarificationAnswer && plan.includes("webSearch") && plan.includes("generateImage")) {
    const searchOutput = steps.find((step) => step.toolName === "webSearch")
      ?.output as WebSearchResult | undefined;
    const pageOutput = steps.find((step) => step.toolName === "readWebPage")
      ?.output as Awaited<ReturnType<typeof readWebPage>> | undefined;

    if (needsFreshResearchBeforeImage(requestContext) && !hasConfirmedResearch(searchOutput, pageOutput)) {
      blockedImageAnswer = buildResearchBlockedImageAnswer(
        searchOutput?.query ?? extractSearchQuery(requestContext),
        searchOutput,
      );
    }
  }

  if (plan.includes("generateImage")) {
    const searchOutput = steps.find((step) => step.toolName === "webSearch")
      ?.output as WebSearchResult | undefined;
    const pageOutput = steps.find((step) => step.toolName === "readWebPage")
      ?.output as Awaited<ReturnType<typeof readWebPage>> | undefined;
    const isSocialPostImage = /\b(post|social|linkedin|facebook|instagram)\b/i.test(requestContext);
    const prompt = [
      isSocialPostImage
        ? `Professional social media graphic for a business announcement about AI automation services and dedicated AI agents for companies. Modern B2B style, clean composition, dark navy and lime green accents, abstract AI network, confident but approachable, no text. Request context: ${text}`
        : `Professional modern logo or visual concept based on this request: ${requestContext}`,
      searchOutput?.summary ? `Research context: ${searchOutput.summary}` : "",
      pageOutput?.ok && pageOutput.content
        ? `Official website context: ${pageOutput.content.slice(0, 1200)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (!clarificationAnswer && !blockedImageAnswer) {
      const output = await generateGoogleImage(prompt);

      steps.push({
        toolName: "generateImage",
        input: { prompt },
        output,
      });
    }
  }

  if (clarificationAnswer) {
    answerParts.push(clarificationAnswer);
  } else if (blockedImageAnswer) {
    answerParts.push(blockedImageAnswer);
  } else if (continuesCompanyLogoTask) {
    const pageOutput = steps.find((step) => step.toolName === "readWebPage")
      ?.output as Awaited<ReturnType<typeof readWebPage>> | undefined;
    const imageOutput = steps.find((step) => step.toolName === "generateImage")
      ?.output as GenerateImageResult | undefined;

    answerParts.push(
      [
        summarizeReadPageResult(pageOutput, requestContext),
        "",
        imageOutput?.ok
          ? `**Propozycja logo:** wygenerowano wersję roboczą w narzędziu ${imageOutput.provider}.`
          : `**Propozycja logo:** nie udało się wygenerować grafiki. ${imageOutput?.error ?? "Sprawdź klucz Google albo spróbuj ponownie za chwilę."}`,
      ].join("\n"),
    );
  } else if (!businessTask && plan.includes("webSearch") && plan.includes("generateImage")) {
    const searchOutput = steps.find((step) => step.toolName === "webSearch")
      ?.output as WebSearchResult | undefined;
    const pageOutput = steps.find((step) => step.toolName === "readWebPage")
      ?.output as Awaited<ReturnType<typeof readWebPage>> | undefined;
    const imageOutput = steps.find((step) => step.toolName === "generateImage")
      ?.output as GenerateImageResult | undefined;
    const pageSummary = buildResearchArticle(
      searchOutput?.query ?? extractSearchQuery(text),
      searchOutput,
      pageOutput,
    );

    answerParts.push(
      [
        pageSummary,
        "",
        /\b(logo|znak|identyfikacj|brand|branding)\b/i.test(requestContext)
          ? `**Propozycja logo:** wygenerowano wersję roboczą w narzędziu ${imageOutput?.provider ?? "generator obrazu"}.`
          : `**Propozycja grafiki:** wygenerowano wersję roboczą w narzędziu ${imageOutput?.provider ?? "generator obrazu"}.`,
      ].join("\n"),
    );
  } else if (!businessTask && plan.includes("webSearch")) {
    const searchOutput = steps.find((step) => step.toolName === "webSearch")
      ?.output as WebSearchResult | undefined;
    const pageOutput = steps.find((step) => step.toolName === "readWebPage")
      ?.output as Awaited<ReturnType<typeof readWebPage>> | undefined;
    const pageSummary = buildResearchArticle(
      searchOutput?.query ?? extractSearchQuery(text),
      searchOutput,
      pageOutput,
    );

    answerParts.push(
      pageSummary,
    );
  } else if (plan.includes("generateImage")) {
    const imageOutput = steps.find((step) => step.toolName === "generateImage")
      ?.output as GenerateImageResult | undefined;

    answerParts.push(
      `Wygenerowano obraz narzędziem ${
        imageOutput?.provider ?? "generator obrazu"
      }. To wersja robocza do obejrzenia i dalszego dopracowania.`,
    );
  }

  if (plan.includes("readWebPage") && answerParts.length === 0) {
    const pageOutput = steps.find((step) => step.toolName === "readWebPage")
      ?.output as Awaited<ReturnType<typeof readWebPage>> | undefined;

    answerParts.push(
      summarizeReadPageResult(pageOutput, text),
    );
  }

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute({ writer }) {
      steps.forEach((step, index) => {
        const toolCallId = `direct-tool-${Date.now()}-${index}`;

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

      writer.write({ type: "text-start", id: "direct-answer" } as never);
      writer.write({
        type: "text-delta",
        id: "direct-answer",
        delta: answerParts.join("\n\n"),
      } as never);
      writer.write({ type: "text-end", id: "direct-answer" } as never);
      writer.write({ type: "finish", finishReason: "stop" } as never);
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function decodeSearchUrl(url: string) {
  const normalizedUrl = url.startsWith("//") ? `https:${url}` : url;

  try {
    const parsedUrl = new URL(normalizedUrl);
    const redirectedUrl = parsedUrl.searchParams.get("uddg");

    return redirectedUrl ? decodeURIComponent(redirectedUrl) : normalizedUrl;
  } catch {
    return normalizedUrl;
  }
}

function stripHtml(text: string) {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
    .trim();
}

function extractSearchResults(html: string) {
  const results: WebSearchResult["sources"] = [];
  const blocks = html.split(/<div class="result\b/i).slice(1, 8);

  for (const block of blocks) {
    const linkMatch = block.match(
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );

    if (!linkMatch) {
      continue;
    }

    const snippetMatch = block.match(
      /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const url = decodeSearchUrl(linkMatch[1]);
    const title = stripHtml(linkMatch[2]);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";

    const domain = domainFromUrl(url).toLowerCase();
    const isLowValueResult =
      domain.includes("translate.google") ||
      domain.includes("google.com") ||
      domain.includes("duckduckgo.com") ||
      /tłumacz google|google translate/i.test(title);

    if (title && url && !url.includes("duckduckgo.com/y.js") && !isLowValueResult) {
      results.push({ title, url, snippet });
    }
  }

  if (results.length === 0) {
    const anchors = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

    for (const anchor of anchors) {
      const url = decodeSearchUrl(anchor[1]);
      const title = stripHtml(anchor[2]);
      const domain = domainFromUrl(url).toLowerCase();
      const isLowValueResult =
        !/^https?:\/\//i.test(url) ||
        domain.includes("translate.google") ||
        domain.includes("google.com") ||
        domain.includes("duckduckgo.com") ||
        domain.includes("javascript") ||
        /tłumacz google|google translate|images|videos|news|maps/i.test(title);

      if (title.length > 3 && !isLowValueResult) {
        results.push({ title, url, snippet: "" });
      }

      if (results.length >= 5) {
        break;
      }
    }
  }

  return results.slice(0, 5);
}

function buildSearchSummary(
  query: string,
  sources: WebSearchResult["sources"],
  scope: WebSearchResult["scope"],
) {
  if (sources.length === 0) {
    return `Nie udało mi się pobrać konkretnych wyników dla zapytania "${query}". Nie będę udawać, że znam fakty. Spróbuj podać dokładniejszą nazwę firmy albo adres strony, wtedy użyję czytania strony.`;
  }

  const domains = sources
    .slice(0, 4)
    .map((source) => domainFromUrl(source.url))
    .filter(Boolean)
    .join(", ");

  return [
    scope === "polish"
      ? `Sprawdziłam najpierw polskie źródła dla zapytania "${query}".`
      : `Nie znalazłam wystarczających polskich źródeł dla zapytania "${query}", więc użyłam także wyników globalnych.`,
    `Przejrzałam ${sources.length} wyników i na ich podstawie przygotowuję syntetyczne opracowanie, a nie listę cytatów.`,
    `Najbardziej użyteczne domeny: ${domains || "brak pewnych domen"}.`,
  ].join("\n");

  const lines = sources.slice(0, 3).map((source, index) => {
    const domain = domainFromUrl(source.url);
    const shouldShowSnippet =
      source.snippet && (scope === "polish" || looksLikePolishText(source.snippet));
    const snippet = shouldShowSnippet
      ? ` Opis wyniku: ${source.snippet}`
      : " Opis źródła nie jest po polsku albo nie został pobrany, więc nie wklejam go jako głównej odpowiedzi.";

    return `${index + 1}. ${source.title} (${domain}).${snippet}`;
  });

  return [
    scope === "polish"
      ? `Najpierw sprawdziłam polskie źródła dla zapytania "${query}" i znalazłam wyniki z polskiego kontekstu:`
      : `Nie znalazłam wystarczająco dobrych polskich wyników dla zapytania "${query}", więc użyłam wyników globalnych:`,
    ...lines,
    "Wnioski opisuję po polsku. Przy firmach o mało widocznej obecności w sieci warto dodatkowo potwierdzić oficjalną stronę lub profil firmy.",
  ].join("\n");
}

async function webSearch(query: string): Promise<WebSearchResult> {
  const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const polishQuery = `${query} Polska site:.pl`;
  const globalQuery = query;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const fetchResults = async (searchQuery: string, locale = "pl-pl") => {
      const urls = [
        `https://duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}&kl=${encodeURIComponent(locale)}`,
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(searchQuery)}&kl=${encodeURIComponent(locale)}`,
      ];
      const errors: string[] = [];

      for (const searchUrl of urls) {
        try {
          const response = await fetch(searchUrl, {
            signal: controller.signal,
            headers: {
              "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 VieAI/1.0",
              accept: "text/html,application/xhtml+xml,text/plain",
              "accept-language": "pl-PL,pl;q=0.9,en;q=0.6",
            },
          });

          if (!response.ok) {
            errors.push(`${domainFromUrl(searchUrl)} HTTP ${response.status}`);
            continue;
          }

          const results = extractSearchResults(await response.text());

          if (results.length > 0) {
            return results;
          }

          errors.push(`${domainFromUrl(searchUrl)} bez wyników w HTML`);
        } catch (fetchError) {
          const message =
            fetchError instanceof Error && fetchError.name === "AbortError"
              ? "limit czasu"
              : fetchError instanceof Error
                ? fetchError.message
                : "nieznany błąd";
          errors.push(`${domainFromUrl(searchUrl)}: ${message}`);
        }
      }

      throw new Error(errors.join("; ") || "wyszukiwarka nie zwróciła wyników");
    };

    const polishResults = await fetchResults(polishQuery, "pl-pl");
    const polishSources = polishResults.filter(isPolishSource);
    const globalResults =
      polishSources.length > 0 ? [] : await fetchResults(globalQuery, "wt-wt");
    const globalPolishSources = globalResults.filter(isPolishSource);
    const scope: WebSearchResult["scope"] =
      polishSources.length > 0 || globalPolishSources.length > 0
        ? "polish"
        : "global";
    const usedQuery = polishSources.length > 0 ? polishQuery : globalQuery;
    const candidateSources =
      polishSources.length > 0
        ? polishSources
        : globalPolishSources.length > 0
          ? globalPolishSources
          : globalResults;
    const relevantSources = candidateSources.filter((source) =>
      isRelevantToQuery(source, query),
    );
    const sources = relevantSources.length > 0 ? relevantSources : candidateSources;

    return {
      query,
      usedQuery,
      scope,
      summary: buildSearchSummary(query, sources, scope),
      sources,
      fallbackUrl,
      note:
        "Research zostal wklejony bezposrednio do czatu. Linki sa tylko zrodlami pomocniczymi.",
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "przekroczono limit czasu pobierania wynikow"
        : error instanceof Error
          ? error.message
          : "nieznany blad";

    return {
      query,
      usedQuery: query,
      scope: "global",
      summary: `Nie udało mi się pobrać konkretnych wyników dla zapytania "${query}" bezpośrednio w aplikacji. Powód techniczny: ${message}. Nie podaję zmyślonych informacji; mogę dalej pracować, jeśli podasz adres strony firmy albo wkleisz tekst źródłowy.`,
      sources: [],
      fallbackUrl,
      note:
        "To awaryjna odpowiedz narzedzia. Agent nie linkuje jako glownego wyniku, tylko jasno wyjasnia, ze nie pobral danych.",
    };
  } finally {
    clearTimeout(timeout);
  }
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
) {
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

type AgentUserProfile = {
  name: string | null;
  preferences: Record<string, string> | null;
};

async function getAgentUserProfile(userId: string, accessToken: string) {
  const rows = await supabaseRequest<AgentUserProfile[]>(
    `user_profiles?select=name,preferences&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {},
    accessToken,
  ).catch(() => []);
  return rows[0] ?? null;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const { messages, mode, model } = (await request.json()) as {
    messages: UIMessage[];
    mode?: ChatMode;
    model?: ModelChoice;
  };

  const selectedMode = getMode(mode);
  const selectedModel = getModel(model);
  const inputValidation = validateUserInput(getLatestUserMessageText(messages));

  if (!inputValidation.ok) {
    await recordUserSecurityEvent(user.id, "blocked_input");
    return createSecurityResponse(messages, blockedInputMessage);
  }

  const rateLimit = checkRateLimit(user.id);

  if (!rateLimit.ok) {
    await recordUserSecurityEvent(user.id, "rate_limited");
    return createSecurityResponse(messages, rateLimit.message);
  }

  await recordUserSecurityEvent(user.id, "accepted_message");

  const safeMessages = sanitizeMessages(messages);
  const tokenBudget = await assertDailyTokenBudget(user);

  if (!tokenBudget.ok) {
    await recordUserSecurityEvent(user.id, "token_limited");
    return createSecurityResponse(messages, tokenBudget.message);
  }

  const inputTokenEstimate = estimateMessagesTokens(safeMessages);
  const latestUserText = getLatestUserText(safeMessages);
  const userProfile = await getAgentUserProfile(user.id, user.accessToken);
  const profileContext = userProfile
    ? `\n\n## PROFIL UŻYTKOWNIKA\nImię: ${userProfile.name || "nie podano"}.\nPreferencje: ${JSON.stringify(userProfile.preferences ?? {})}. Uwzględniaj te informacje naturalnie i nie pytaj ponownie o dane, które są już zapisane.`
    : "";
  const directToolResponse = await buildDirectToolResponse(latestUserText, safeMessages, user.id);
  const forceGroundingForCurrentRequest = needsFreshResearchBeforeImage(latestUserText);

  if (directToolResponse) {
    return directToolResponse;
  }

  const result = streamText({
    model: google(modelIds[selectedModel]),
    experimental_transform: outputFilterTransform(() =>
      recordUserSecurityEvent(user.id, "filtered_output"),
    ),
    system: withResponseLanguage(request, `${prompts[selectedMode]}${internetRules}${knowledgeRules}${profileContext}${securityPrompt}`),
    messages: await convertToModelMessages(safeMessages),
    stopWhen: stepCountIs(maxSteps),
    onFinish: async ({ usage }) => {
      await logApiUsage({
        userId: user.id,
        usage,
        inputEstimate: inputTokenEstimate,
        model: modelIds[selectedModel],
        endpoint: "/api/agent",
      });
    },
    tools: {
      ...useSearchGrounding(forceGroundingForCurrentRequest),
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
      }),      webSearch: tool({
        description:
          "Przygotowuje link do wyszukiwania Google dla podanej frazy. Uzywaj do aktualnych informacji, tematow do sprawdzenia i researchu.",
        inputSchema: jsonSchema<WebSearchInput>({
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Fraza do wyszukania w Google.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        }),
        execute: async ({ query }) => webSearch(query),
      }),
      calculator: tool({
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









