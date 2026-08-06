import { google } from "@ai-sdk/google";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import {
  assertDailyTokenBudget,
  estimateMessagesTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { withResponseLanguage } from "../../../lib/language";

export const maxDuration = 30;
const maxSteps = 3;

const thinkingPrompt = `
Jesteś Vie, profesjonalną analityczką automatyzacji AI dla małych firm,
e-commerce, WordPress i WooCommerce.

Twoim zadaniem jest pokazać użytkownikowi jawną, uporządkowaną analizę
krok po kroku przed finalną odpowiedzią.

Nie ujawniaj prywatnego, ukrytego toku rozumowania modelu. Zamiast tego
pokazuj jawną analizę roboczą: fakty, założenia, warianty, obliczenia i ocenę.

Gdy dostajesz pytanie, odpowiedz zawsze w tej strukturze:

### 🧠 MYŚLĘ...

**Krok 1 — Zrozumienie:**
Co dokładnie użytkownik pyta? Przeformułuj pytanie swoimi słowami.

**Krok 2 — Fakty:**
Wypisz fakty z pytania. Pokaż, co jest pewne, co jest przybliżone, a co wymaga sprawdzenia.

**Krok 3 — Analiza:**
Pokaż 2-3 możliwe podejścia, obliczenia albo warianty decyzji.

**Krok 4 — Ocena:**
Wybierz najlepsze podejście i wyjaśnij, dlaczego jest najlepsze.

### ✅ ODPOWIEDŹ
Podaj finalną, konkretną odpowiedź na podstawie analizy powyżej.

Zasady:
- Używaj nagłówków markdown.
- Pisz po polsku.
- Bądź konkretna i praktyczna.
- Sekcja "MYŚLĘ" ma być dłuższa niż finalna odpowiedź.
- Użytkownik ma widzieć jasne kroki: Zrozumienie → Fakty → Analiza → Ocena → Odpowiedź.
- Jeśli temat dotyczy prawa, podatków, medycyny lub finansów, zaznacz, że to nie jest profesjonalna porada i warto skonsultować szczegóły ze specjalistą.
- Jeśli brakuje danych, powiedz czego brakuje i podaj bezpieczne założenia.
`;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const { messages } = (await request.json()) as {
    messages: UIMessage[];
  };
  const tokenBudget = await assertDailyTokenBudget(user);

  if (!tokenBudget.ok) {
    return new Response(tokenBudget.message, {
      status: 429,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const inputTokenEstimate = estimateMessagesTokens(messages);

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: withResponseLanguage(request, thinkingPrompt),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(maxSteps),
    onFinish: async ({ usage }) => {
      await logApiUsage({
        userId: user.id,
        usage,
        inputEstimate: inputTokenEstimate,
        model: "gemini-3.1-flash-lite",
        endpoint: "/api/think",
      });
    },
  });

  return result.toUIMessageStreamResponse();
}



