import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../../lib/supabase";

type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type UsageRow = {
  user_id: string;
  tokens_input: number | null;
  tokens_output: number | null;
  endpoint: string | null;
  created_at: string;
};

type MessageRow = { conversation_id: string };
type AdminUser = { id: string; email?: string };

const inputPricePerMillion = Number(process.env.AI_INPUT_PRICE_PER_MILLION ?? 0.15);
const outputPricePerMillion = Number(process.env.AI_OUTPUT_PRICE_PER_MILLION ?? 0.6);

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return {
      date: isoDay(date),
      label: new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "2-digit" }).format(date),
    };
  });
}

async function getAdminUsers(serviceRoleKey: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) return [];

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    cache: "no-store",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { users?: AdminUser[] };
  return payload.users ?? [];
}

function isAllowedAdmin(email?: string) {
  const configured = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!configured.length) return process.env.NODE_ENV !== "production";
  return Boolean(email && configured.includes(email.toLowerCase()));
}

export async function GET(request: Request) {
  try {
    const currentUser = await getAuthenticatedUser(request);
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const globalMode = Boolean(serviceRoleKey && isAllowedAdmin(currentUser.email));
    const accessToken = globalMode ? undefined : currentUser.accessToken;
    const userFilter = globalMode ? "" : `&user_id=eq.${encodeURIComponent(currentUser.id)}`;
    const days = lastSevenDays();
    const rangeStart = `${days[0].date}T00:00:00.000Z`;

    const [conversations, usageRows, adminUsers] = await Promise.all([
      supabaseRequest<ConversationRow[]>(
        `conversations?select=id,user_id,title,created_at,updated_at${userFilter}&order=updated_at.desc&limit=10000`,
        {},
        accessToken,
      ),
      supabaseRequest<UsageRow[]>(
        `api_usage?select=user_id,tokens_input,tokens_output,endpoint,created_at${userFilter}&created_at=gte.${encodeURIComponent(rangeStart)}&order=created_at.asc&limit=10000`,
        {},
        accessToken,
      ),
      globalMode && serviceRoleKey ? getAdminUsers(serviceRoleKey) : Promise.resolve([currentUser]),
    ]);

    const latestConversations = conversations.slice(0, 10);
    const latestIds = latestConversations.map((item) => item.id);
    const messages = latestIds.length
      ? await supabaseRequest<MessageRow[]>(
          `messages?select=conversation_id&conversation_id=in.(${latestIds.join(",")})&limit=10000`,
          {},
          accessToken,
        )
      : [];

    const today = isoDay(new Date());
    const todayUsage = usageRows.filter((row) => row.created_at.slice(0, 10) === today);
    const tokensToday = todayUsage.reduce(
      (sum, row) => sum + (row.tokens_input ?? 0) + (row.tokens_output ?? 0),
      0,
    );
    const costToday = todayUsage.reduce(
      (sum, row) =>
        sum +
        ((row.tokens_input ?? 0) / 1_000_000) * inputPricePerMillion +
        ((row.tokens_output ?? 0) / 1_000_000) * outputPricePerMillion,
      0,
    );

    const trend = days.map((day) => {
      const dayUsage = usageRows.filter((row) => row.created_at.slice(0, 10) === day.date);
      return {
        ...day,
        tokens: dayUsage.reduce((sum, row) => sum + (row.tokens_input ?? 0) + (row.tokens_output ?? 0), 0),
        conversations: conversations.filter((row) => row.created_at.slice(0, 10) === day.date).length,
      };
    });

    const endpointGroups = [
      { name: "/chat", match: ["/chat", "/api/chat"] },
      { name: "/react", match: ["/react", "/api/react"] },
      { name: "/report", match: ["/report", "/api/report"] },
      { name: "/email-triage", match: ["/email-triage", "/api/email-triage"] },
    ].map((group) => ({
      name: group.name,
      tokens: usageRows
        .filter((row) => group.match.includes(row.endpoint ?? ""))
        .reduce((sum, row) => sum + (row.tokens_input ?? 0) + (row.tokens_output ?? 0), 0),
    }));
    const groupedTokens = endpointGroups.reduce((sum, item) => sum + item.tokens, 0);
    const allTokens = usageRows.reduce((sum, row) => sum + (row.tokens_input ?? 0) + (row.tokens_output ?? 0), 0);
    if (allTokens > groupedTokens) endpointGroups.push({ name: "Inne", tokens: allTokens - groupedTokens });

    const emails = new Map(adminUsers.map((user) => [user.id, user.email ?? "Brak e-maila"]));
    const messageCounts = messages.reduce<Record<string, number>>((counts, message) => {
      counts[message.conversation_id] = (counts[message.conversation_id] ?? 0) + 1;
      return counts;
    }, {});

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      scope: globalMode ? "global" : "personal",
      metrics: {
        users: new Set(conversations.map((item) => item.user_id)).size,
        conversations: conversations.length,
        tokensToday,
        costToday,
      },
      pricing: { inputPricePerMillion, outputPricePerMillion },
      trend,
      endpoints: endpointGroups,
      latestConversations: latestConversations.map((conversation) => ({
        id: conversation.id,
        email: emails.get(conversation.user_id) ?? "Użytkownik",
        title: conversation.title || "Rozmowa bez tytułu",
        updatedAt: conversation.updated_at,
        messages: messageCounts[conversation.id] ?? 0,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się pobrać statystyk.";
    const status = message.includes("zalog") || message.includes("Sesja") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
