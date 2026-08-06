import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../lib/supabase";

type Conversation = { id: string; title: string | null; updated_at: string };
type StoredMessage = { id: string; role: "user" | "assistant"; content: string };

function authStatus(error: unknown) {
  return error instanceof Error && error.message.includes("zalog") ? 401 : 500;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const requestedId = new URL(request.url).searchParams.get("id");
    const userId = encodeURIComponent(user.id);
    const path = requestedId
      ? `conversations?select=id,title,updated_at&id=eq.${encodeURIComponent(requestedId)}&user_id=eq.${userId}&limit=1`
      : `conversations?select=id,title,updated_at&user_id=eq.${userId}&order=updated_at.desc&limit=1`;
    const rows = await supabaseRequest<Conversation[]>(path, {}, user.accessToken);

    if (!rows[0]) {
      return NextResponse.json({ conversation: null, messages: [] });
    }

    const conversation = rows[0];
    const messages = await supabaseRequest<StoredMessage[]>(
      `messages?select=id,role,content&conversation_id=eq.${conversation.id}&order=created_at.asc`,
      {},
      user.accessToken,
    );

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd Supabase" },
      { status: authStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = (await request.json()) as { title?: string };
    const rows = await supabaseRequest<Conversation[]>(
      "conversations",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          title: body.title?.slice(0, 50) || "Nowa rozmowa",
          user_id: user.id,
        }),
      },
      user.accessToken,
    );

    return NextResponse.json({ conversation: rows[0] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd Supabase" },
      { status: authStatus(error) },
    );
  }
}
