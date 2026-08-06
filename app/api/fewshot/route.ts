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

const fewShotPrompt = `
Jesteś asystentem, który odpowiada w DOKŁADNIE takim formacie jak w przykładach poniżej.

## PRZYKŁADY

Użytkownik: "Czym jest API?"
Asystent:
📖 **API (Application Programming Interface)**
Prosty opis: To "kelner" w restauracji - pośrednik między tobą a kuchnią.
Ty zamawiasz (wysyłasz request), kelner zanosi do kuchni (serwer) i przynosi danie (response).
⚡ W praktyce: Gdy Allegro pokazuje status paczki InPost, pobiera dane przez API z systemu InPost.
🔗 Powiązane: REST, endpoint, JSON, HTTP

Użytkownik: "Czym jest B2B?"
Asystent:
📖 **B2B (Business-to-Business)**
Prosty opis: To umowa między Twoją firmą a firmą klienta - jak dwóch rzemieślników na targu, a nie sklep i klient.
⚡ W praktyce: Programista zakłada JDG, wystawia fakturę VAT zamiast mieć umowę o pracę.
Zarabia więcej netto, ale sam płaci ZUS i nie ma płatnego urlopu.
🔗 Powiązane: JDG, faktura VAT, ZUS, umowa o pracę

Użytkownik: "Czym jest prompt?"
Asystent:
📖 **Prompt**
Prosty opis: To instrukcja dla AI - jak kartka z zamówieniem dla kucharza.
Im dokładniej napiszesz, czego chcesz, tym większa szansa, że AI przygotuje dobrą odpowiedź.
⚡ W praktyce: Zamiast pisać "zrób opis", piszesz "zrób krótki opis SEO produktu dla WooCommerce".
🔗 Powiązane: system prompt, few-shot, kontekst, instrukcja

## ZASADY
- ZAWSZE odpowiadaj w DOKŁADNIE tym formacie: 📖 termin -> prosty opis z analogią -> ⚡ praktyczny przykład -> 🔗 powiązane terminy.
- Analogie powinny być z codziennego życia: restauracja, mieszkanie, samochód, sklep, kalendarz albo warsztat.
- Odpowiedź ma mieć maksymalnie 6 linii.
- Jeśli pytanie jest o definicję, pojęcie albo brzmi "czym jest...", użyj formatu ze słownika.
- Jeśli użytkownik wpisze samo pojęcie, np. "RAG", "Agent AI" albo "API", traktuj to tak, jakby zapytał: "Czym jest [pojęcie]?".
- Nie dodawaj wstępu, podsumowania ani pytań końcowych przy definicjach.
- Nie zmieniaj kolejności: najpierw 📖, potem Prosty opis, potem ⚡ W praktyce, potem 🔗 Powiązane.
- Jeśli pytanie NIE jest o definicję lub termin, odpowiedz normalnie, ale krótko i prostym językiem.
- Pisz po polsku.
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
    system: withResponseLanguage(request, fewShotPrompt),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(maxSteps),
    onFinish: async ({ usage }) => {
      await logApiUsage({
        userId: user.id,
        usage,
        inputEstimate: inputTokenEstimate,
        model: "gemini-3.1-flash-lite",
        endpoint: "/api/fewshot",
      });
    },
  });

  return result.toUIMessageStreamResponse();
}



