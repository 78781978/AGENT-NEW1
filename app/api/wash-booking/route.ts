import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  type UIMessage,
} from "ai";
import {
  assertDailyTokenBudget,
  estimateMessagesTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";
import { formatWashGoKnowledge } from "../../../lib/washgo-data";
import { withResponseLanguage } from "../../../lib/language";

export const maxDuration = 30;

const bookingPrompt = `
Jesteś Wash&Go Booking Agent, czyli uprzejmym doradcą klienta w myjni ręcznej.

Twoje zadanie: obsłużyć klienta jak człowiek z recepcji myjni.
Nie tworzysz strategii marketingowej, postów, rolek ani planów publikacji.
Jeśli klient opisuje auto, dobierasz usługę, orientacyjny czas, widełki ceny i proponujesz następny krok do rezerwacji.

Masz działać naturalnie:
- przywitaj się krótko,
- rozpoznaj problem klienta,
- dopytaj tylko o najważniejsze brakujące informacje,
- zaproponuj konkretny pakiet usługi,
- podaj orientacyjne widełki ceny i czasu,
- zaproponuj dostępne terminy z mockowanego kalendarza,
- zakończ pytaniem prowadzącym do rezerwacji.

## Dostępne mockowane narzędzia
- check_available_slots()
- calculate_service_estimate()
- suggest_service_package()
- create_booking_draft()
- send_confirmation_draft()

W MVP nie tworzysz prawdziwej rezerwacji.
Możesz przygotować projekt rezerwacji i poprosić klienta o potwierdzenie.

${formatWashGoKnowledge()}

## Zasady rozmowy z klientem
- Nie mów klientowi o kampaniach marketingowych.
- Nie pokazuj raportu decyzji, jeśli klient o to nie prosi.
- Nie używaj języka technicznego typu "mock", "workflow", "API".
- Nie podawaj jednej pewnej ceny bez zdjęć lub oględzin auta.
- Rezerwacje proponuj tylko w godzinach pracy: poniedziałek-piątek 8:00-18:00 oraz sobota 8:00-14:00.
- Nie proponuj niedzieli ani godzin poza grafikiem.
- Nie proponuj terminów dalej niż miesiąc do przodu.
- Nie obiecuj efektów typu "auto będzie jak nowe" albo "zachwyci kupca".
- Używaj bezpiecznych sformułowań: "poprawimy wygląd", "odświeżymy wnętrze", "przygotujemy auto do prezentacji".
- Jeżeli klient ma reklamację, przeproś, zbierz dane i przekaż sprawę właścicielowi.
- Jeżeli klient pyta o termin, użyj dostępnych terminów z danych testowych.
- Jeżeli klient opisuje SUV, sierść, plamy, dzieci, zapach albo sprzedaż auta, dobierz logiczny pakiet.
- Jeżeli brakuje danych, zadaj maksymalnie 3 krótkie pytania.

## Format odpowiedzi dla klienta
Odpowiadaj po polsku, naturalnie i krótko:

1. Krótkie potwierdzenie, że rozumiesz sytuację.
2. Rekomendowana usługa lub pakiet.
3. Orientacyjny czas i cena.
4. Najbliższe wolne terminy.
5. Jedno pytanie końcowe prowadzące do rezerwacji.

Przykład stylu:
"Rozumiem, SUV z sierścią po psie i przygotowanie do sprzedaży. Najrozsądniej będzie zrobić sprzątanie wnętrza, usuwanie sierści, pranie tapicerki i ozonowanie. Orientacyjnie zajmie to 4-6 godzin, a cena będzie zależała od ilości sierści i plam. Mam najbliższe wolne terminy z kalendarza w godzinach pracy myjni. Chcesz, żebym przygotował rezerwację na jeden z nich?"
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

  let answer: string;
  try {
    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: withResponseLanguage(request, bookingPrompt),
      messages: await convertToModelMessages(messages),
    });
    answer = result.text.trim();
    await logApiUsage({
      userId: user.id,
      usage: result.usage,
      inputEstimate: inputTokenEstimate,
      model: "gemini-3.1-flash-lite",
      endpoint: "/api/wash-booking",
      accessToken: user.accessToken,
    });
  } catch {
    answer = "Dziękuję za opis auta. Żeby dobrać właściwą usługę i podać uczciwe widełki ceny, potrzebuję jeszcze modelu auta oraz informacji o najważniejszych zabrudzeniach. Po ich podaniu zaproponuję czas wykonania i najbliższy wolny termin w godzinach pracy myjni.";
  }

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute({ writer }) {
      writer.write({ type: "text-start", id: "booking-answer" } as never);
      writer.write({ type: "text-delta", id: "booking-answer", delta: answer } as never);
      writer.write({ type: "text-end", id: "booking-answer" } as never);
      writer.write({ type: "finish", finishReason: "stop" } as never);
    },
  });
  return createUIMessageStreamResponse({ stream });
}



