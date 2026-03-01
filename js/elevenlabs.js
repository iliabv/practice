const MODEL_ID = 'eleven_multilingual_v2';
const API_BASE = 'https://api.elevenlabs.io/v1';

const CACHE_NAME = 'tts-cache';
const OUTPUT_FORMAT = 'wav_24000';

/**
 * Fetch TTS audio for the given text. Returns a WAV audio Blob.
 * Results are cached via the Cache API — persists across page reloads.
 * Each unique (voice, speed, language, text) combo hits the API only once.
 */
export async function textToSpeech(text, apiKey, { previousText, nextText, voiceId, speed, languageCode } = {}) {
  const vid = voiceId || 'EXAVITQu4vr4xnSDxMaL';
  const spd = speed ?? 1.0;
  const lang = languageCode || 'auto';
  const cacheKey = `${OUTPUT_FORMAT}:${vid}:${spd}:${lang}:${text}`;
  const cacheUrl = `https://tts-cache/${encodeURIComponent(cacheKey)}`;

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheUrl);
  if (cached) return cached.blob();

  const res = await fetch(`${API_BASE}/text-to-speech/${vid}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
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
  await cache.put(cacheUrl, new Response(blob));
  return blob;
}

/** Supported languages for the multilingual v2 model. */
export const LANGUAGES = [
  { code: 'auto', name: 'Automatic' },
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
