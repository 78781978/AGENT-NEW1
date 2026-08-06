import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../lib/supabase";

type Conversation = { id: string; title: string | null; created_at: string; updated_at: string };
type Message = { conversation_id: string; content: string; created_at: string };

function authStatus(error: unknown) {
  return error instanceof Error && /zalog|sesja|jwt|token/i.test(error.message) ? 401 : 500;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const userId = encodeURIComponent(user.id);
    const conversations = await supabaseRequest<Conversation[]>(
      `conversations?select=id,title,created_at,updated_at&user_id=eq.${userId}&order=updated_at.desc`,
      {},
      user.accessToken,
    );
    const conversationIds = conversations.map((conversation) => conversation.id);
    const messages = conversationIds.length
      ? await supabaseRequest<Message[]>(
          `messages?select=conversation_id,content,created_at&conversation_id=in.(${conversationIds.join(",")})&order=created_at.asc`,
          {},
          user.accessToken,
        )
      : [];

    return NextResponse.json({
      conversations: conversations.map((conversation) => {
        const related = messages.filter((message) => message.conversation_id === conversation.id);
        return {
          ...conversation,
          messageCount: related.length,
          preview: related.at(-1)?.content ?? "Brak wiadomości",
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd Supabase" },
      { status: authStatus(error) },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const id = new URL(request.url).searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Brakuje identyfikatora." }, { status: 400 });
    }

    const safeId = encodeURIComponent(id);
    const conversations = await supabaseRequest<Array<{ id: string }>>(
      `conversations?select=id&id=eq.${safeId}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      {},
      user.accessToken,
    );

    if (!conversations[0]) {
      return NextResponse.json({ error: "Nie masz dostępu do tej rozmowy." }, { status: 403 });
    }

    await supabaseRequest(
      `messages?conversation_id=eq.${safeId}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
      user.accessToken,
    );
    await supabaseRequest(
      `conversations?id=eq.${safeId}&user_id=eq.${encodeURIComponent(user.id)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
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
