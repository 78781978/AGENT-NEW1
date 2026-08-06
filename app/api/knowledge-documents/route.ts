import { getAuthenticatedUser, supabaseRequest } from "../../../lib/supabase";

type DocumentRow = {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nieznany błąd.";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim();

  try {
    const user = await getAuthenticatedUser(request);
    const userId = encodeURIComponent(user.id);

    if (title) {
      const chunks = await supabaseRequest<DocumentRow[]>(
        `documents?select=id,title,content,metadata,created_at&title=eq.${encodeURIComponent(
          title,
        )}&user_id=eq.${userId}&order=created_at.asc`,
        {},
        user.accessToken,
      );

      return Response.json({
        title,
        chunks: Array.isArray(chunks) ? chunks : [],
      });
    }

    const rows = await supabaseRequest<DocumentRow[]>(
      `documents?select=id,title,content,metadata,created_at&user_id=eq.${userId}&order=created_at.desc`,
      {},
      user.accessToken,
    );
    const grouped = new Map<
      string,
      {
        title: string;
        chunks: number;
        created_at: string;
      }
    >();

    for (const row of rows ?? []) {
      const existing = grouped.get(row.title);

      if (existing) {
        existing.chunks += 1;
        if (new Date(row.created_at) < new Date(existing.created_at)) {
          existing.created_at = row.created_at;
        }
      } else {
        grouped.set(row.title, {
          title: row.title,
          chunks: 1,
          created_at: row.created_at,
        });
      }
    }

    const documents = Array.from(grouped.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return Response.json({
      documents,
      total_documents: documents.length,
      total_chunks: rows?.length ?? 0,
    });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
