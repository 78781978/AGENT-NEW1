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
  const clean = (value?: string) => value?.trim().replace(/[.!?]+$/, "");
  const name = clean(
    text.match(/(?:mam na imi[eę]|nazywam si[eę])\s+([a-ząćęłńóśźż-]+)/i)?.[1],
  );
  const likes = clean(
    text.match(/\blubi[eę]\s+(.{2,120}?)(?=\s+(?:i\s+)?mieszkam\b|[.;!?]|$)/i)?.[1],
  );
  const city = clean(
    text.match(/\bmieszkam w\s+([a-ząćęłńóśźż -]{2,60}?)(?=[,.;!?]|$)/i)?.[1],
  );

  return {
    name,
    preferences: {
      ...(likes ? { "co_lubię": likes } : {}),
      ...(city ? { miasto: city } : {}),
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

  await supabaseRequest<UserProfile[]>(
    "user_profiles?on_conflict=id",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: userId,
        name: details.name ?? current?.name ?? null,
        preferences: {
          ...(current?.preferences ?? {}),
          ...details.preferences,
        },
      }),
    },
    accessToken,
  );
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

    if (body.role === "user" && body.content?.trim()) {
      await rememberUserProfile(user.id, user.accessToken, body.content);
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd Supabase" },
      { status: authStatus(error) },
    );
  }
}
