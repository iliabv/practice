const MODEL_ID = 'eleven_multilingual_v2';
const API_BASE = 'https://api.elevenlabs.io/v1';

/** In-memory TTS cache: "voiceId:speed:text" → audio Blob */
const cache = new Map();

/** Clear the TTS cache (e.g. when voice or speed changes). */
export function clearTTSCache() {
  cache.clear();
}

/**
 * Fetch TTS audio for the given text. Returns an audio Blob.
 * Results are cached in memory — each unique (voice, speed, text) combo hits the API only once.
 */
export async function textToSpeech(text, apiKey, { previousText, nextText, voiceId, speed, languageCode } = {}) {
  const vid = voiceId || 'EXAVITQu4vr4xnSDxMaL';
  const spd = speed ?? 1.0;
  const lang = languageCode || 'auto';
  const cacheKey = `${vid}:${spd}:${lang}:${text}`;

  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const res = await fetch(`${API_BASE}/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      ...(lang !== 'auto' && { language_code: lang }),
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: spd },
      ...(previousText && { previous_text: previousText }),
      ...(nextText && { next_text: nextText }),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs API error ${res.status}: ${body}`);
  }

  const blob = await res.blob();
  cache.set(cacheKey, blob);
  return blob;
}

/** Supported languages for the multilingual v2 model. */
export const LANGUAGES = [
  { code: 'auto', name: 'Guess' },
  { code: 'ar', name: 'Arabic' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hr', name: 'Croatian' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'en', name: 'English' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ms', name: 'Malay' },
  { code: 'no', name: 'Norwegian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'es', name: 'Spanish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'ta', name: 'Tamil' },
  { code: 'tl', name: 'Filipino' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'vi', name: 'Vietnamese' },
];

/** Available voices for the UI. */
export const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric' },
];
