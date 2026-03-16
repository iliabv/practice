import { LANGUAGES } from './tts.js';

const CACHE_NAME = 'gemini-translate-cache';

// Clean up old Google Translate cache
caches.delete('google-translate-cache');

function languageName(languageCode) {
  const lang = LANGUAGES.find(l => l.code === languageCode);
  return lang ? lang.name : languageCode;
}

/**
 * Translate/analyze a word via Gemini generateContent with structured output.
 * @param {string} word
 * @param {string} apiKey
 * @param {string} sourceLanguage — full languageCode e.g. 'nl-NL'
 * @param {string} sentenceContext — the sentence containing the word
 * @returns {Promise<{translation: string, infinitive: string, partOfSpeech: string, synonyms: string[], usage: string}>}
 */
export async function translateWord(word, apiKey, sourceLanguage, sentenceContext) {
  const cacheKey = `https://gemini-translate-cache/${encodeURIComponent(`${sourceLanguage}:${word}:${sentenceContext}`)}`;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const langName = languageName(sourceLanguage);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `Analyze this ${langName} word: "${word}"\nSentence context: "${sentenceContext}"\n\nProvide the English translation (as used in this context), the dictionary/infinitive form, part of speech, 2-3 synonyms in ${langName}, and a brief usage note about this word.`,
          }],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              translation: { type: 'STRING', description: 'English translation of the word as used in this context' },
              infinitive: { type: 'STRING', description: 'Dictionary/infinitive form of the word' },
              partOfSpeech: { type: 'STRING', description: 'Part of speech (noun, verb, adjective, etc.)' },
              synonyms: {
                type: 'ARRAY',
                items: { type: 'STRING' },
                description: `2-3 synonyms in ${langName}`,
              },
              usage: { type: 'STRING', description: 'Brief usage note about this word' },
            },
            required: ['translation', 'infinitive', 'partOfSpeech', 'synonyms', 'usage'],
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini');

  const result = JSON.parse(text);
  await cache.put(cacheKey, new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  }));
  return result;
}

/**
 * Explain a sentence via Gemini: translation + brief grammar breakdown.
 * @param {string} sentence
 * @param {string} apiKey
 * @param {string} sourceLanguage — full languageCode e.g. 'nl-NL'
 * @returns {Promise<{translation: string, grammar: string}>}
 */
export async function explainSentence(sentence, apiKey, sourceLanguage) {
  const cacheKey = `https://gemini-translate-cache/${encodeURIComponent(`explain:${sourceLanguage}:${sentence}`)}`;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const langName = languageName(sourceLanguage);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `Translate this ${langName} sentence to English and briefly explain its grammar.\n\nSentence: "${sentence}"`,
          }],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              translation: { type: 'STRING', description: 'English translation of the sentence' },
              grammar: { type: 'STRING', description: 'Brief grammar explanation (key structures, tenses, word order)' },
            },
            required: ['translation', 'grammar'],
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini');

  const result = JSON.parse(text);
  await cache.put(cacheKey, new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  }));
  return result;
}
