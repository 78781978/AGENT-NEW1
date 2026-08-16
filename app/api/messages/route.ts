import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../lib/supabase";

type ConversationOwner = {
  id: string;
};

type UserProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, string> | null;
};

function extractProfileDetails(text: string) {
  const clean = (value?: string) =>
    value?.trim().replace(/^[,;:\s]+|[,;:.!?\s]+$/g, "");
  const name = clean(
    text.match(
      /(?:mam na imi[eę]|nazywam si[eę]|moje imi[eę] to)\s+([a-ząćęłńóśźż-]+(?:\s+[a-ząćęłńóśźż-]+)?)(?=\s*(?:,|\.|;|!|\?|\bi\s+(?:lubi[eę]|uwielbiam|mieszkam)\b|$))/i,
    )?.[1],
  );
  const likes = clean(
    text.match(
      /(?:\blubi[eę]\b|\buwielbiam\b|\bmoje hobby to\b|\binteresuj[eę] si[eę]\b)\s+(.{2,160}?)(?=\s+(?:i\s+)?(?:mieszkam|pochodz[eę]|jestem)\b|[.;!?]|$)/i,
    )?.[1],
  );
  const city = clean(
    text.match(
      /(?:\bmieszkam w\b|\bpochodz[eę] z\b|\bjestem z\b)\s+([a-ząćęłńóśźż -]{2,60}?)(?=\s*(?:,|[.;!?]|$))/i,
    )?.[1],
  );

  return {
    name,
    preferences: {
      ...(likes ? { "co_lubię": likes } : {}),
      ...(city ? { "gdzie_mieszkam": city } : {}),
    },
  };
}

async function rememberUserProfile(
  userId: string,
  accessToken: string,
  content: string,
) {
  const details = extractProfileDetails(content);
  if (!details.name && !Object.keys(details.preferences).length) return;

  const rows = await supabaseRequest<UserProfile[]>(
    `user_profiles?select=id,name,preferences&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {},
    accessToken,
  );
  const current = rows[0];
  const currentPreferences =
    current?.preferences && typeof current.preferences === "object" && !Array.isArray(current.preferences)
      ? current.preferences
      : {};
  const profile = {
    name: details.name ?? current?.name ?? null,
    preferences: {
      ...currentPreferences,
      ...details.preferences,
    },
  };

  if (current) {
    await supabaseRequest<UserProfile[]>(
      `user_profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(profile),
      },
      accessToken,
    );
    return;
  }

  await supabaseRequest<UserProfile[]>("user_profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ id: userId, ...profile }),
  }, accessToken);
}

function authStatus(error: unknown) {
  return error instanceof Error && error.message.includes("zalog") ? 401 : 500;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = (await request.json()) as {
      conversationId: string;
      role: "user" | "assistant";
      content: string;
    };

    const conversations = await supabaseRequest<ConversationOwner[]>(
      `conversations?select=id&id=eq.${encodeURIComponent(body.conversationId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      {},
      user.accessToken,
    );

    if (!conversations[0]) {
      return NextResponse.json({ error: "Nie masz dostępu do tej rozmowy." }, { status: 403 });
    }

    await supabaseRequest("messages", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        conversation_id: body.conversationId,
        role: body.role,
        content: body.content,
      }),
    }, user.accessToken);

    await supabaseRequest(
      `conversations?id=eq.${encodeURIComponent(body.conversationId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      },
      user.accessToken,
    );

    if (body.role === "user" && body.content?.trim()) {
      await rememberUserProfile(user.id, user.accessToken, body.content).catch((error) => {
        console.error("Nie udało się zaktualizować profilu użytkownika:", error);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd Supabase" },
      { status: authStatus(error) },
    );
  }
}
