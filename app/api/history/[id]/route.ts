import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../../lib/supabase";

type Conversation = { id: string; title: string | null; created_at: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant"; content: string; created_at: string };

function authStatus(error: unknown) {
  return error instanceof Error && /zalog|sesja|jwt|token/i.test(error.message) ? 401 : 500;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    const { id } = await context.params;
    const safeId = encodeURIComponent(id);
    const conversations = await supabaseRequest<Conversation[]>(
      `conversations?select=id,title,created_at,updated_at&id=eq.${safeId}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      {},
      user.accessToken,
    );

    if (!conversations[0]) {
      return NextResponse.json({ error: "Nie znaleziono rozmowy." }, { status: 404 });
    }

    const messages = await supabaseRequest<Message[]>(
      `messages?select=id,role,content,created_at&conversation_id=eq.${safeId}&order=created_at.asc`,
      {},
      user.accessToken,
    );

    return NextResponse.json({ conversation: conversations[0], messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd Supabase" },
      { status: authStatus(error) },
    );
  }
}
