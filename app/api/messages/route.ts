import { NextResponse } from "next/server";
import { getAuthenticatedUser, supabaseRequest } from "../../../lib/supabase";

type ConversationOwner = {
  id: string;
};

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd Supabase" },
      { status: authStatus(error) },
    );
  }
}
