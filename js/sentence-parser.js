/**
 * Split text into sentences on .!? followed by whitespace.
 * Returns an array of trimmed, non-empty sentences.
 */
export function parseSentences(text) {
  if (!text || !text.trim()) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
