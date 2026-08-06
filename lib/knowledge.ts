import { embedText } from "./embeddings";
import { supabaseRequest } from "./supabase";

export type KnowledgeSearchResult = {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  added_at: string | null;
};

export type KnowledgeSearchResponse = {
  results: KnowledgeSearchResult[];
  total_found: number;
  source_documents: string[];
  message?: string;
};

type RawKnowledgeSearchResult = Omit<KnowledgeSearchResult, "added_at">;

type DocumentDateRow = {
  id: string;
  created_at: string;
};

type DocumentOwnerRow = {
  id: string;
};

const stopWords = new Set([
  "czy",
  "dla",
  "ile",
  "jak",
  "jaka",
  "jaki",
  "jakie",
  "jest",
  "koszt",
  "kosztuje",
  "kosztuja",
  "mam",
  "moge",
  "mozna",
  "oraz",
  "pakiet",
  "pakiety",
  "prosze",
  "sie",
  "ten",
  "tym",
  "zawiera",
]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9\s]/g, " ");
}

function getImportantTokens(query: string) {
  return normalizeText(query)
    .split(/\s+/)
    .map((token) => token.trim())
    .map((token) => {
      if (token.includes("rezygn")) return "rezygn";
      if (token.includes("anul")) return "anul";
      return token;
    })
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function hasLexicalMatch(query: string, result: RawKnowledgeSearchResult) {
  const tokens = getImportantTokens(query);

  if (!tokens.length) {
    return result.similarity >= 0.72;
  }

  const haystack = normalizeText(`${result.title} ${result.content}`);
  return tokens.some((token) => haystack.includes(token));
}

export async function searchKnowledge(
  query: string,
  matchThreshold = 0.5,
  matchCount = 5,
  userId?: string,
  accessToken?: string,
): Promise<KnowledgeSearchResponse> {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return {
      results: [],
      total_found: 0,
      source_documents: [],
      message: "Nie podano pytania do wyszukania w bazie wiedzy.",
    };
  }

  const embedding = await embedText(cleanQuery);
  const results = await supabaseRequest<RawKnowledgeSearchResult[]>(
    userId ? "rpc/match_documents_for_user" : "rpc/match_documents",
    {
      method: "POST",
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        ...(userId ? { owner_id: userId } : {}),
      }),
    },
    accessToken,
  );

  const safeResults = (Array.isArray(results) ? results : [])
    .map((result) => ({
      ...result,
      similarity: Number(result.similarity),
    }))
    .filter((result) => hasLexicalMatch(cleanQuery, result));

  if (!safeResults.length) {
    return {
      results: [],
      total_found: 0,
      source_documents: [],
      message: "Nie znaleziono informacji w bazie wiedzy.",
    };
  }

  const ids = safeResults.map((result) => result.id).filter(Boolean);
  const ownerRows = ids.length && userId
    ? await supabaseRequest<DocumentOwnerRow[]>(
        `documents?select=id&id=in.(${ids.join(",")})&user_id=eq.${encodeURIComponent(userId)}`,
        {},
        accessToken,
      )
    : [];
  const allowedIds = userId
    ? new Set((Array.isArray(ownerRows) ? ownerRows : []).map((row) => row.id))
    : null;
  const filteredResults = allowedIds
    ? safeResults.filter((result) => allowedIds.has(result.id))
    : safeResults;

  if (!filteredResults.length) {
    return {
      results: [],
      total_found: 0,
      source_documents: [],
      message: "Nie znaleziono informacji w Twojej prywatnej bazie wiedzy.",
    };
  }

  const filteredIds = filteredResults.map((result) => result.id).filter(Boolean);
  const dateRows = ids.length
    ? await supabaseRequest<DocumentDateRow[]>(
        `documents?select=id,created_at&id=in.(${filteredIds.join(",")})${userId ? `&user_id=eq.${encodeURIComponent(userId)}` : ""}`,
        {},
        accessToken,
      )
    : [];
  const datesById = new Map(
    (Array.isArray(dateRows) ? dateRows : []).map((row) => [row.id, row.created_at]),
  );
  const enrichedResults = filteredResults.map((result) => ({
    ...result,
    added_at: datesById.get(result.id) ?? null,
  }));
  const sourceDocuments = Array.from(
    new Set(
      enrichedResults
        .map((result) => {
          const source = result.metadata?.source;
          return typeof source === "string" && source.trim()
            ? source.trim()
            : result.title.trim();
        })
        .filter(Boolean),
    ),
  );

  return {
    results: enrichedResults,
    total_found: enrichedResults.length,
    source_documents: sourceDocuments,
  };
}
