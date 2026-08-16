export function splitIntoChunks(
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return [];
  }

  const words = normalizedText.split(" ").filter(Boolean);
  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    let end = start;
    let length = 0;

    while (end < words.length) {
      const addedLength = words[end].length + (end > start ? 1 : 0);
      if (length + addedLength > chunkSize && end > start) break;
      length += addedLength;
      end += 1;
    }

    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;

    let nextStart = end;
    let overlapLength = 0;
    while (nextStart > start) {
      const previousWordLength = words[nextStart - 1].length + (overlapLength ? 1 : 0);
      if (overlapLength + previousWordLength > overlap) break;
      overlapLength += previousWordLength;
      nextStart -= 1;
    }

    // Zawsze przesuwamy okno naprzód, także gdy pojedyncze słowo jest bardzo długie.
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}
