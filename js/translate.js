const CACHE_NAME = 'google-translate-cache';
const API_BASE = 'https://translation.googleapis.com/language/translate/v2';

/**
 * Translate text to English via Google Cloud Translation API.
 * Results are cached via the Cache API.
 * @param {string} text
 * @param {string} apiKey
 * @param {string} sourceLanguage — e.g. 'nl' (extracted from languageCode at call site)
 * @returns {Promise<string>} English translation
 */
export async function translateText(text, apiKey, sourceLanguage) {
  const cacheKey = `https://translate-cache/${encodeURIComponent(`${sourceLanguage}:${text}`)}`;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey);
  if (cached) return cached.text();

  const res = await fetch(`${API_BASE}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: sourceLanguage,
      target: 'en',
      format: 'text',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Translate API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const translation = data.data.translations[0].translatedText;
  await cache.put(cacheKey, new Response(translation, {
    headers: { 'Content-Type': 'text/plain' },
  }));
  return translation;
}
