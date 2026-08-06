import { google } from "@ai-sdk/google";
import {
  assertDailyTokenBudget,
  estimateTextTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";
import { streamText } from "ai";

export const maxDuration = 30;

const systemPrompt = `
Jesteś profesjonalnym asystentem do zarządzania pocztą.

Dla KAŻDEGO maila wykonaj:
1. 📧 KATEGORYZACJA: określ typ (zapytanie ofertowe / reklamacja / spam / informacja / prośba o spotkanie)
2. 🔴🟡🟢 PRIORYTET: Wysoki (wymaga odpowiedzi dziś) / Średni (w ciągu 3 dni) / Niski (może poczekać)
3. ✍️ DRAFT: napisz krótki, profesjonalny szkic odpowiedzi (3-5 zdań)

FORMAT ODPOWIEDZI:
Dla każdego maila:

### Mail [numer]: [krótki temat]
| Kategoria | [typ] |
| Priorytet | [🔴 Wysoki / 🟡 Średni / 🟢 Niski / 🗑️ Spam] |
| Uzasadnienie | [dlaczego ten priorytet] |

**Proponowana odpowiedź:**
> [draft odpowiedzi albo "Brak odpowiedzi - spam/newsletter"]

---

Na końcu dodaj:

## PODSUMOWANIE
- 🔴 Pilne: [ile] maili
- 🟡 Średnie: [ile] maili
- 🟢 Niskie: [ile] maili
- 🗑️ Spam: [ile] maili
- ✅ Rekomendacja: [który mail obsłużyć najpierw]

Zasady:
- Pisz po polsku.
- Nie pomijaj żadnego maila.
- Przy reklamacji i pilnym problemie bądź empatyczny, konkretny i profesjonalny.
- Przy spamie nie pisz odpowiedzi do nadawcy, tylko zaznacz, że należy usunąć lub zignorować.
`;

function normalizeEmails(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((email): email is string => typeof email === "string")
    .map((email) => email.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function localTriage(emails: string[]) {
  const blocks = emails.map((email, index) => {
    const lower = email.toLowerCase();
    const isSpam = /won|winner|claim|prize|limited time|click here|milion|million/.test(lower);
    const isComplaint = /reklamac|nie działa|problem|zrezygn|nie mogę|piln|korekt|faktur/.test(lower);
    const isMeeting = /spotkanie|umówić|współprac|propozycja|partner/.test(lower);
    const isNewsletter = /newsletter|raport|pobierz|trendy/.test(lower);
    const priority = isSpam || isNewsletter ? "🟢 Niski" : isComplaint ? "🔴 Wysoki" : isMeeting ? "🟡 Średni" : "🟢 Niski";
    const category = isSpam
      ? "spam"
      : isComplaint
        ? "reklamacja / pilny problem"
        : isMeeting
          ? "prośba o spotkanie / zapytanie ofertowe"
          : "informacja";
    const subject = email.match(/Temat:\s*(.+)/i)?.[1]?.trim() || `Wiadomość ${index + 1}`;
    const reason = isSpam
      ? "Wiadomość wygląda na masową próbę wyłudzenia."
      : isComplaint
        ? "Wymaga szybkiej reakcji, bo dotyczy problemu klienta albo ważnego terminu."
        : isMeeting
          ? "Może prowadzić do współpracy, ale nie wymaga reakcji natychmiast."
          : "Wiadomość informacyjna, można obsłużyć później.";
    const draft = isSpam
      ? "Brak odpowiedzi - wiadomość wygląda na spam i należy ją usunąć lub oznaczyć jako niechcianą."
      : isNewsletter
        ? "Brak pilnej odpowiedzi. Warto zapisać raport do przeczytania później, jeśli temat jest biznesowo przydatny."
        : isComplaint
          ? "Dzień dobry, dziękujemy za wiadomość i przepraszamy za niedogodności. Sprawdzimy sprawę priorytetowo i wrócimy z informacją jeszcze dziś. Prosimy o przesłanie dodatkowych danych, jeśli są potrzebne do szybszej weryfikacji. Zależy nam na szybkim rozwiązaniu problemu."
          : "Dzień dobry, dziękujemy za kontakt i propozycję. Chętnie poznamy szczegóły oraz możliwy zakres współpracy. Proszę przesłać krótką agendę lub zaproponować dwa terminy rozmowy w przyszłym tygodniu. Po otrzymaniu informacji potwierdzimy dogodny termin.";

    return [
      `### Mail ${index + 1}: ${subject}`,
      `| Kategoria | ${category} |`,
      `| Priorytet | ${priority} |`,
      `| Uzasadnienie | ${reason} |`,
      "",
      "**Proponowana odpowiedź:**",
      `> ${draft}`,
      "",
      "---",
    ].join("\n");
  });

  const urgent = blocks.filter((block) => block.includes("🔴 Wysoki")).length;
  const medium = blocks.filter((block) => block.includes("🟡 Średni")).length;
  const low = blocks.filter((block) => block.includes("🟢 Niski")).length;
  const spam = blocks.filter((block) => block.includes("spam")).length;

  return [
    ...blocks,
    "## PODSUMOWANIE",
    `- 🔴 Pilne: ${urgent} maili`,
    `- 🟡 Średnie: ${medium} maili`,
    `- 🟢 Niskie: ${low} maili`,
    `- 🗑️ Spam: ${spam} maili`,
    "- ✅ Rekomendacja: zacznij od maili oznaczonych jako 🔴 Wysoki, szczególnie reklamacji i tematów z terminem na dziś lub jutro.",
    "",
    "> Tryb awaryjny: klasyfikacja została przygotowana lokalnie, bo model AI chwilowo nie odpowiedział.",
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const body = (await request.json().catch(() => null)) as { emails?: unknown } | null;
  const emails = normalizeEmails(body?.emails);

  if (emails.length === 0) {
    return Response.json({ error: "Wklej przynajmniej jeden mail do analizy." }, { status: 400 });
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

    const prompt = emails.map((email, index) => `MAIL ${index + 1}\n${email}`).join("\n\n---\n\n");
    const result = streamText({
      model: google("gemini-3.1-flash-lite"),
      system: withResponseLanguage(request, systemPrompt),
      prompt,
      onFinish: async ({ usage }) => {
        await logApiUsage({
          userId: user.id,
          usage,
          inputEstimate: estimateTextTokens(`${systemPrompt}\n${prompt}`),
          model: "gemini-3.1-flash-lite",
          endpoint: "/api/email-triage",
        });
      },
    });

    return result.toTextStreamResponse();
  } catch {
    return new Response(localTriage(emails), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
}
