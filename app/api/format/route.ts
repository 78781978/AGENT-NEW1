import { google } from "@ai-sdk/google";
import { convertToModelMessages, generateText, type UIMessage } from "ai";

import {
  assertDailyTokenBudget,
  estimateMessagesTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";

export const maxDuration = 30;

const formatPrompt = `
Jesteś asystentem, który formatuje odpowiedzi według instrukcji użytkownika.

Rozpoznajesz komendy formatu na początku wiadomości:

/tabela [temat] - odpowiedz w formie tabeli markdown.
Kolumny dobierz do tematu. Minimum 3 kolumny i 5 wierszy.
Przykład: /tabela porównanie frameworków JavaScript

/lista [temat] - odpowiedz jako lista numerowana z opisami.
Każdy punkt: numer + nagłówek pogrubiony + 1 zdanie opisu.
Przykład: /lista 10 zasad dobrego kodu

/porownanie [A] vs [B] - tabela porównawcza dwóch rzeczy.
Kolumny: Aspekt | [A] | [B] | Werdykt.
Minimum 6 aspektów + wiersz podsumowania.
Przykład: /porownanie React vs Vue

/faq [temat] - lista pytań i odpowiedzi.
Format: **Q:** pytanie oraz **A:** odpowiedź.
Minimum 5 par Q&A.
Przykład: /faq praca zdalna

/email [opis] - napisz profesjonalny email.
Format: Temat | Od/Do | Treść | Podpis.
Przykład: /email prośba o urlop na 2 tygodnie

Jeśli wiadomość NIE zaczyna się od komendy, odpowiadaj normalnie, ale w czystym, czytelnym markdown.

ZASADY OBOWIĄZKOWE:
- ZAWSZE formatuj w markdown.
- Przy /tabela i /porownanie używaj prawdziwej tabeli markdown z pionowymi kreskami.
- Nie dodawaj kod blocków wokół tabel.
- Nie opisuj, że "oto tabela" dłużej niż jednym krótkim zdaniem.
- Pisz po polsku.
`;

function getLatestText(messages: UIMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === "user");

  return (
    latest?.parts
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim() ?? ""
  );
}

function stripCommand(text: string, command: string) {
  return text.replace(new RegExp(`^${command}\\s*`, "i"), "").trim();
}

function localFormatResponse(rawText: string) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (lower.startsWith("/porownanie") || lower.startsWith("/porównanie")) {
    const topic = stripCommand(stripCommand(text, "/porownanie"), "/porównanie") || "A vs B";
    const [leftRaw, rightRaw] = topic.split(/\s+vs\s+/i);
    const left = leftRaw?.trim() || "Opcja A";
    const right = rightRaw?.trim() || "Opcja B";

    return [
      `Krótkie porównanie: **${left} vs ${right}**.`,
      "",
      `| Aspekt | ${left} | ${right} | Werdykt |`,
      "|---|---|---|---|",
      `| Najlepsze zastosowanie | Dobre do szybkiej pracy, automatyzacji i szerokich zadań. | Dobre do analizy, pisania i pracy z dłuższym kontekstem. | Zależy od celu. |`,
      "| Styl odpowiedzi | Zwykle dynamiczny i praktyczny. | Często spokojny, dokładny i uporządkowany. | Oba są wartościowe. |",
      "| Praca z kodem | Pomaga pisać, poprawiać i wyjaśniać kod. | Dobrze analizuje logikę i strukturę kodu. | Remis. |",
      "| Zadania biznesowe | Dobry do planów, ofert, automatyzacji i szybkich wersji roboczych. | Dobry do dokumentów, strategii i głębszej analizy. | Warto testować oba. |",
      "| Łatwość dla początkujących | Bardzo dobry do nauki krok po kroku. | Dobry, gdy chcesz spokojnych wyjaśnień. | ChatGPT lekko wygrywa dla startu. |",
      "| Podsumowanie | Lepszy jako codzienny asystent operacyjny. | Lepszy jako analityk i redaktor długich treści. | Najlepiej używać zależnie od zadania. |",
    ].join("\n");
  }

  if (lower.startsWith("/tabela")) {
    const topic = stripCommand(text, "/tabela") || "temat";

    return [
      `Tabela dla tematu: **${topic}**.`,
      "",
      "| Element | Do czego służy | Dla kogo | Poziom trudności |",
      "|---|---|---|---|",
      "| Python | Automatyzacje, API, analiza danych | Początkujący i firmy | Łatwy start |",
      "| JavaScript | Strony internetowe i aplikacje | Frontend i full-stack | Średni |",
      "| SQL | Praca z bazami danych | Analitycy i backend | Łatwy start |",
      "| FastAPI | Tworzenie API w Pythonie | Backend i AI tools | Średni |",
      "| Next.js | Aplikacje webowe i dashboardy | SaaS i produkty online | Średni |",
    ].join("\n");
  }

  if (lower.startsWith("/lista")) {
    const topic = stripCommand(text, "/lista") || "zadanie";

    return [
      `Lista dla tematu: **${topic}**.`,
      "",
      "1. **Określ cel** - napisz jednym zdaniem, co chcesz osiągnąć.",
      "2. **Zbierz dane** - przygotuj informacje, przykłady i ograniczenia.",
      "3. **Zaprojektuj prosty proces** - rozpisz kroki od początku do końca.",
      "4. **Zbuduj małą wersję** - zacznij od MVP, bez zbędnych dodatków.",
      "5. **Przetestuj wynik** - sprawdź, czy działa dla prawdziwego przykładu.",
    ].join("\n");
  }

  if (lower.startsWith("/faq")) {
    const topic = stripCommand(text, "/faq") || "temat";

    return [
      `FAQ: **${topic}**.`,
      "",
      "**Q:** Od czego zacząć?",
      "**A:** Zacznij od prostego celu i jednego konkretnego przypadku użycia.",
      "",
      "**Q:** Czy trzeba znać programowanie?",
      "**A:** Na początku wystarczą podstawy, ale warto uczyć się krok po kroku.",
      "",
      "**Q:** Jak sprawdzić, czy rozwiązanie działa?",
      "**A:** Użyj danych testowych i zapisz oczekiwany wynik.",
      "",
      "**Q:** Czy można używać prawdziwych haseł?",
      "**A:** Nie. Klucze i hasła zawsze trzymaj w zmiennych środowiskowych.",
      "",
      "**Q:** Kiedy rozwijać projekt dalej?",
      "**A:** Dopiero gdy mała wersja działa stabilnie i daje wartość.",
    ].join("\n");
  }

  if (lower.startsWith("/email")) {
    const topic = stripCommand(text, "/email") || "wiadomość";

    return [
      `**Temat:** ${topic}`,
      "",
      "**Od:** [Twoje imię]",
      "**Do:** [Odbiorca]",
      "",
      "**Treść:**",
      "Dzień dobry,",
      "",
      `piszę w sprawie: ${topic}. Chciałabym podziękować za dotychczasowy kontakt i potwierdzić, że zależy mi na profesjonalnym oraz sprawnym domknięciu tematu.`,
      "",
      "W razie potrzeby chętnie doprecyzuję szczegóły lub prześlę dodatkowe informacje.",
      "",
      "**Podpis:**",
      "Pozdrawiam serdecznie,",
      "[Twoje imię]",
    ].join("\n");
  }

  return [
    "Odpowiedź w czytelnym formacie markdown:",
    "",
    `**Temat:** ${text || "brak tematu"}`,
    "",
    "- **Cel:** uporządkować informacje w prosty sposób.",
    "- **Najważniejsze:** zacząć od konkretnego problemu i przykładu.",
    "- **Następny krok:** doprecyzować dane wejściowe i przetestować wynik.",
  ].join("\n");
}

export async function POST(request: Request) {
  let latestText = "";

  try {
    const user = await getAuthenticatedUser(request);
    const { messages } = (await request.json()) as {
      messages: UIMessage[];
    };
    latestText = getLatestText(messages);
    const tokenBudget = await assertDailyTokenBudget(user);

    if (!tokenBudget.ok) {
      return Response.json({ text: tokenBudget.message }, { status: 429 });
    }

    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: withResponseLanguage(request, formatPrompt),
      messages: await convertToModelMessages(messages),
    });

    await logApiUsage({
      userId: user.id,
      usage: result.usage,
      inputEstimate: estimateMessagesTokens(messages),
      model: "gemini-3.1-flash-lite",
      endpoint: "/api/format",
    });

    return Response.json({ text: result.text });
  } catch (error) {
    const fallback = localFormatResponse(latestText);

    return Response.json({
      text: [
        fallback,
        "",
        "> Tryb awaryjny: odpowiedź została przygotowana lokalnie, bo model AI chwilowo nie odpowiedział.",
      ].join("\n"),
    });
  }
}



