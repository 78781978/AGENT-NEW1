type GoogleEmbeddingResponse = {
  embedding?: {
    values?: number[];
  };
  error?: {
    message?: string;
  };
};

function getGoogleApiKey() {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY
  );
}

export async function embedText(text: string) {
  const apiKey = getGoogleApiKey();

  if (!apiKey) {
    throw new Error("Brakuje klucza Google API w .env.local.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: {
          parts: [{ text }],
        },
        outputDimensionality: 768,
      }),
    },
  );

  const data = (await response.json()) as GoogleEmbeddingResponse;

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Google Embedding API zwróciło błąd HTTP ${response.status}.`,
    );
  }

  const embedding = data.embedding?.values;

  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error("Google API nie zwróciło poprawnego wektora 768 liczb.");
  }

  return embedding;
}
