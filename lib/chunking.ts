export function splitIntoChunks(
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();

  if (!normalizedText) {
    return [];
  }

  const sentences = normalizedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const nextChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;

    if (nextChunk.length <= chunkSize || !currentChunk) {
      currentChunk = nextChunk;
      continue;
    }

    chunks.push(currentChunk.trim());
    const overlapText = currentChunk.slice(Math.max(0, currentChunk.length - overlap)).trim();
    currentChunk = overlapText ? `${overlapText} ${sentence}` : sentence;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
