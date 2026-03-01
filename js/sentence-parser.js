/**
 * Split text into sentences, preserving line break structure.
 * Splits on newline boundaries while counting consecutive newlines between chunks,
 * then splits on .!? boundaries within each chunk.
 * Returns { sentences: string[], lineBreaks: Map<number, number> }
 * where lineBreaks maps sentence index → number of \n characters before that sentence.
 */
export function parseSentences(text) {
  if (!text || !text.trim()) return { sentences: [], lineBreaks: new Map() };

  // Split on newline boundaries, keeping the delimiters to count them
  const parts = text.split(/(\n+)/);
  const sentences = [];
  const lineBreaks = new Map();
  let pendingNewlines = 0;

  for (const part of parts) {
    if (/^\n+$/.test(part)) {
      pendingNewlines += part.length;
      continue;
    }
    const trimmed = part.trim();
    if (!trimmed) continue;

    const chunks = trimmed
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (let i = 0; i < chunks.length; i++) {
      if (i === 0 && pendingNewlines > 0 && sentences.length > 0) {
        lineBreaks.set(sentences.length, pendingNewlines);
      }
      sentences.push(chunks[i]);
    }
    pendingNewlines = 0;
  }

  return { sentences, lineBreaks };
}
