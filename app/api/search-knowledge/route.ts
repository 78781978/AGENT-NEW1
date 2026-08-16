import { searchKnowledge } from "../../../lib/knowledge";
import { getAuthenticatedUser } from "../../../lib/supabase";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    query?: unknown;
  } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";

  if (!query) {
    return Response.json({ error: "Pole query jest wymagane." }, { status: 400 });
  }

  try {
    const user = await getAuthenticatedUser(request);
    const result = await searchKnowledge(query, 0.5, 5, user.id, user.accessToken);
    return Response.json({
      ...result,
      answer:
        result.results.length > 0
          ? null
          : "Nie posiadam wiedzy na ten temat, ponieważ nie ma jej w bazie wiedzy.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się wyszukać w bazie wiedzy.",
      },
      { status: 500 },
    );
  }
}
