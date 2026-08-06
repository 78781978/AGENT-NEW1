import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { supabaseRequest } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const allowedTypes = ["feedback", "alert", "order"] as const;

type WebhookType = (typeof allowedTypes)[number];

type WebhookPayload = {
  type?: unknown;
  data?: unknown;
};

type SavedWebhookEvent = {
  id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebhookType(value: unknown): value is WebhookType {
  return typeof value === "string" && allowedTypes.includes(value as WebhookType);
}

function safeText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function validatePayload(body: WebhookPayload | null) {
  if (!body || !isWebhookType(body.type)) {
    return {
      ok: false as const,
      error: "Podaj poprawny typ zdarzenia: feedback, alert albo order.",
    };
  }

  if (!isRecord(body.data)) {
    return {
      ok: false as const,
      error: "Pole data musi byc obiektem JSON.",
    };
  }

  return {
    ok: true as const,
    type: body.type,
    data: body.data,
  };
}

function checkWebhookSecret(request: Request) {
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (!expectedSecret) return true;
  return request.headers.get("x-webhook-secret") === expectedSecret;
}

function describePayload(type: WebhookType, data: Record<string, unknown>) {
  if (type === "feedback") {
    return [
      `Klient: ${safeText(data.customer) || "brak danych"}`,
      `Ocena: ${safeText(data.rating) || "brak oceny"}`,
      `Komentarz: ${safeText(data.comment) || "brak komentarza"}`,
    ].join("\n");
  }

  if (type === "alert") {
    return [
      `Usluga: ${safeText(data.service) || "brak danych"}`,
      `Status: ${safeText(data.status) || "brak statusu"}`,
      `Od kiedy: ${safeText(data.since) || "brak daty"}`,
    ].join("\n");
  }

  return [
    `Produkt: ${safeText(data.product) || "brak produktu"}`,
    `Klient: ${safeText(data.customer) || "brak klienta"}`,
    `Kwota: ${safeText(data.amount) || "brak kwoty"}`,
  ].join("\n");
}

function fallbackAnalysis(type: WebhookType, data: Record<string, unknown>) {
  if (type === "feedback") {
    const rating = Number(data.rating);
    const priority = Number.isFinite(rating) && rating <= 3 ? "wysoki" : "sredni";
    const sentiment = Number.isFinite(rating) && rating >= 4 ? "pozytywny" : "negatywny lub mieszany";

    return [
      "## Analiza feedbacku",
      `- Sentyment: ${sentiment}`,
      `- Priorytet: ${priority}`,
      `- Klient: ${safeText(data.customer) || "brak danych"}`,
      `- Komentarz: ${safeText(data.comment) || "brak komentarza"}`,
      "",
      "## Rekomendacja",
      priority === "wysoki"
        ? "Odpowiedz szybko, przepros za niedogodnosc, zapytaj o szczegoly i zaproponuj konkretny kolejny krok."
        : "Podziekuj za opinie i zaproponuj dalszy kontakt, jesli klient chce doprecyzowac uwagi.",
      "",
      "## Propozycja odpowiedzi",
      "Dzien dobry, dziekujemy za opinie. Przykro nam, ze doswiadczenie nie bylo w pelni satysfakcjonujace. Chcemy to wyjasnic i poprawic, dlatego prosimy o krotkie doprecyzowanie sytuacji. Wrocimy z konkretna odpowiedzia mozliwie szybko.",
    ].join("\n");
  }

  if (type === "alert") {
    const status = safeText(data.status).toLowerCase();
    const severity = status.includes("down") || status.includes("error") ? "krytyczny" : "sredni";

    return [
      "## Analiza alertu",
      `- Usluga: ${safeText(data.service) || "brak danych"}`,
      `- Status: ${safeText(data.status) || "brak statusu"}`,
      `- Severity: ${severity}`,
      "",
      "## Rekomendowana akcja",
      severity === "krytyczny"
        ? "Sprawdz logi, status hostingu/API, ostatnie wdrozenie i podstawowy healthcheck. Jesli awaria trwa, powiadom osobe techniczna."
        : "Monitoruj usluge i sprawdz, czy alert powtarza sie w kolejnych minutach.",
    ].join("\n");
  }

  return [
    "## Analiza zamowienia",
    `- Produkt: ${safeText(data.product) || "brak produktu"}`,
    `- Klient: ${safeText(data.customer) || "brak klienta"}`,
    `- Kwota: ${safeText(data.amount) || "brak kwoty"}`,
    "",
    "## Podsumowanie",
    "Zamowienie zostalo przyjete do analizy. Warto potwierdzic platnosc, dane klienta oraz dalszy status realizacji.",
  ].join("\n");
}

async function analyzeEvent(type: WebhookType, data: Record<string, unknown>) {
  const prompt = `
Przeanalizuj zdarzenie webhook typu "${type}".

Dane:
${describePayload(type, data)}

Zadanie:
- odpowiedz po polsku,
- zwroc gotowa analize biznesowa,
- dla feedbacku podaj: sentyment, priorytet, ryzyko utraty klienta, sugestie odpowiedzi,
- dla alertu podaj: severity, mozliwa przyczyne, pierwsze 3 kroki naprawy,
- dla order podaj: podsumowanie, ryzyko, nastepny krok,
- nie wymyslaj danych, ktorych nie ma w JSON.
`;

  try {
    const result = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system:
        "Jestes agentem operacyjnym. Analizujesz webhooki z systemow biznesowych i piszesz krotko, konkretnie, po polsku.",
      prompt,
    });

    return result.text.trim() || fallbackAnalysis(type, data);
  } catch {
    return fallbackAnalysis(type, data);
  }
}

async function saveWebhookEvent(type: WebhookType, data: Record<string, unknown>, analysis: string) {
  const rows = await supabaseRequest<SavedWebhookEvent[]>("webhook_events", {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      type,
      data,
      analysis,
    }),
  });

  return rows?.[0]?.id;
}

export async function POST(request: Request) {
  if (!checkWebhookSecret(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as WebhookPayload | null;
  const payload = validatePayload(body);

  if (!payload.ok) {
    return Response.json({ success: false, error: payload.error }, { status: 400 });
  }

  const analysis = await analyzeEvent(payload.type, payload.data);
  const eventId = await saveWebhookEvent(payload.type, payload.data, analysis);

  return Response.json({
    success: true,
    analysis,
    event_id: eventId,
  });
}
