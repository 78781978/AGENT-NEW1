import { embedText } from "../../../lib/embeddings";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return Response.json({ error: "Pole text jest wymagane." }, { status: 400 });
  }

  try {
    const embedding = await embedText(text);

    return Response.json({
      embedding,
      dimensions: embedding.length,
      model: "gemini-embedding-001",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się wygenerować embeddingu.",
      },
      { status: 500 },
    );
  }
}
