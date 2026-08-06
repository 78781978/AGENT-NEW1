import type { UIMessage } from "ai";
import { supabaseRequest, type SupabaseUser } from "./supabase";

export const dailyTokenLimit = Number(process.env.DAILY_TOKEN_LIMIT ?? 10000);
export const tokenLimitMessage =
  "Dzienny limit tokenów (10k) został wyczerpany. Wróć jutro!";

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
};

type ApiUsageRow = {
  tokens_input: number | null;
  tokens_output: number | null;
};

type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
};

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

function todayStartIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export function estimateTextTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateMessagesTokens(messages: UIMessage[]) {
  return estimateTextTokens(JSON.stringify(messages ?? []));
}

export function normalizeTokenUsage(
  usage: unknown,
  fallbackInputTokens = 0,
  fallbackOutputTokens = 0,
): TokenCounts {
  const data = (usage ?? {}) as UsageLike;
  const inputTokens =
    safeNumber(data.inputTokens) ||
    safeNumber(data.promptTokens) ||
    safeNumber(data.input_tokens) ||
    safeNumber(data.prompt_tokens) ||
    safeNumber(fallbackInputTokens);

  let outputTokens =
    safeNumber(data.outputTokens) ||
    safeNumber(data.completionTokens) ||
    safeNumber(data.output_tokens) ||
    safeNumber(data.completion_tokens) ||
    safeNumber(fallbackOutputTokens);

  const totalTokens =
    safeNumber(data.totalTokens) ||
    safeNumber(data.total_tokens);

  if (!outputTokens && totalTokens > inputTokens) {
    outputTokens = totalTokens - inputTokens;
  }

  return {
    inputTokens,
    outputTokens,
  };
}

export async function getDailyTokenUsage(userId: string) {
  const rows = await supabaseRequest<ApiUsageRow[]>(
    [
      "api_usage?select=tokens_input,tokens_output",
      `user_id=eq.${encodeURIComponent(userId)}`,
      `created_at=gte.${encodeURIComponent(todayStartIso())}`,
    ].join("&"),
  ).catch(() => []);

  return rows.reduce(
    (total, row) => total + (row.tokens_input ?? 0) + (row.tokens_output ?? 0),
    0,
  );
}

export async function assertDailyTokenBudget(user: SupabaseUser) {
  const usedTokens = await getDailyTokenUsage(user.id);

  if (usedTokens >= dailyTokenLimit) {
    return {
      ok: false as const,
      usedTokens,
      remainingTokens: 0,
      message: tokenLimitMessage,
    };
  }

  return {
    ok: true as const,
    usedTokens,
    remainingTokens: dailyTokenLimit - usedTokens,
    message: "",
  };
}

export async function logApiUsage(args: {
  userId: string;
  usage?: unknown;
  inputEstimate?: number;
  outputEstimate?: number;
  model: string;
  endpoint: string;
}) {
  const tokens = normalizeTokenUsage(args.usage, args.inputEstimate, args.outputEstimate);

  await supabaseRequest("api_usage", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: args.userId,
      tokens_input: tokens.inputTokens,
      tokens_output: tokens.outputTokens,
      model: args.model,
      endpoint: args.endpoint,
    }),
  }).catch((error) => {
    console.error("Nie udalo sie zapisac zuzycia tokenow:", error);
  });
}
