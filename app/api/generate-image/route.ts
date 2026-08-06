export const maxDuration = 30;

import {
  assertDailyTokenBudget,
  estimateTextTokens,
  logApiUsage,
} from "../../../lib/api-usage";
import { getAuthenticatedUser } from "../../../lib/supabase";

const imageModels = ["gemini-3.1-flash-lite-image"];

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

type GenerateAttemptResult =
  | {
      ok: true;
      model: string;
      provider: string;
      image: string;
      text: string;
    }
  | {
      ok: false;
      model: string;
      error: string;
    };

function getApiKey() {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nieznany blad podczas generowania obrazu.";
}

function summarizeImageErrors(errors: string[]) {
  const allErrors = errors.join(" | ");

  if (allErrors.includes("Quota exceeded") && allErrors.includes("limit: 0")) {
    return "Klucz Google zostal odczytany poprawnie, ale konto nie ma aktywnego limitu dla generowania obrazow w Gemini API (limit 0). W Google AI Studio trzeba wlaczyc dostep/billing dla modeli obrazowych albo uzyc innego klucza z dostepem do generowania grafik.";
  }

  if (allErrors.includes("Quota exceeded")) {
    return "Klucz Google dziala, ale limit generowania obrazow zostal chwilowo przekroczony. Odczekaj chwile albo sprawdz limity w Google AI Studio.";
  }

  return (
    "Klucz zostal odczytany, ale zaden model obrazowy nie jest teraz dostepny dla tego klucza. Szczegoly: " +
    allErrors
  );
}

async function generateWithModel(
  model: string,
  apiKey: string,
  prompt: string,
  signal: AbortSignal,
): Promise<GenerateAttemptResult> {
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
            parts: [
              {
                text: prompt,
              },
            ],
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
      error:
        data.error?.message || `Google API zwrocilo blad HTTP ${response.status}.`,
    };
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);
  const textPart = parts.find((part) => part.text);

  if (!imagePart?.inlineData?.data) {
    return {
      ok: false,
      model,
      error:
        "Model odpowiedzial, ale nie zwrocil obrazu. Sprobuj doprecyzowac opis albo uzyc innego promptu.",
    };
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";

  return {
    ok: true,
    model,
    provider: "Google Gemini",
    image: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    text: textPart?.text || `Obraz zostal wygenerowany modelem ${model}.`,
  };
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown;
    provider?: unknown;
  } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return Response.json(
      { error: "Podaj opis obrazu w polu prompt." },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const tokenBudget = await assertDailyTokenBudget(user);

    if (!tokenBudget.ok) {
      return Response.json({ error: tokenBudget.message }, { status: 429 });
    }

    const errors: string[] = [];

    const apiKey = getApiKey();

    if (!apiKey) {
      return Response.json(
        {
          error:
            "Brakuje klucza Google w pliku .env.local. Dla trybu Google uzyj GOOGLE_GENERATIVE_AI_API_KEY albo GOOGLE_API_KEY.",
        },
        { status: 500 },
      );
    }

    for (const model of imageModels) {
      const result = await generateWithModel(model, apiKey, prompt, controller.signal);

      if (result.ok) {
        await logApiUsage({
          userId: user.id,
          inputEstimate: estimateTextTokens(prompt),
          outputEstimate: 0,
          model: result.model,
          endpoint: "/api/generate-image",
        });

        return Response.json({
          image: result.image,
          text: result.text,
          model: result.model,
          provider: result.provider,
        });
      }

      errors.push(`${result.model}: ${result.error}`);
    }

    return Response.json(
      {
        error: summarizeImageErrors(errors),
      },
      { status: 500 },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Generowanie trwalo dluzej niz 30 sekund. Sprobuj ponownie za chwile."
        : getErrorMessage(error);

    return Response.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}


