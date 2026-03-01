const MODEL_ID = 'eleven_multilingual_v2';
const API_BASE = 'https://api.elevenlabs.io/v1';

const CACHE_NAME = 'tts-cache';
const OUTPUT_FORMAT = 'wav_24000';

function normalizeOpts({ voiceId, speed, languageCode } = {}) {
  return {
    vid: voiceId || 'EXAVITQu4vr4xnSDxMaL',
    spd: speed ?? 1.0,
    lang: languageCode || 'auto',
  };
}

function buildRequestBody(text, lang, spd, { previousText, nextText } = {}) {
  return JSON.stringify({
    text,
    model_id: MODEL_ID,
    ...(lang !== 'auto' && { language_code: lang }),
    voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: spd },
    ...(previousText && { previous_text: previousText }),
    ...(nextText && { next_text: nextText }),
  });
}

async function fetchTTS(url, apiKey, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ElevenLabs API error ${res.status}: ${text}`);
  }
  return res;
}

function cacheUrl(prefix, vid, spd, lang, text) {
  return `https://tts-cache/${encodeURIComponent(`${prefix}${OUTPUT_FORMAT}:${vid}:${spd}:${lang}:${text}`)}`;
}

function base64ToBlob(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: 'audio/wav' });
}

/**
 * Fetch TTS audio for the given text. Returns a WAV audio Blob.
 * Results are cached via the Cache API — persists across page reloads.
 */
export async function textToSpeech(text, apiKey, opts = {}) {
  const { vid, spd, lang } = normalizeOpts(opts);
  const url = cacheUrl('', vid, spd, lang, text);

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached.blob();

  const res = await fetchTTS(
    `${API_BASE}/text-to-speech/${vid}?output_format=${OUTPUT_FORMAT}`,
    apiKey, buildRequestBody(text, lang, spd, opts),
  );

  const blob = await res.blob();
  await cache.put(url, new Response(blob));
  return blob;
}

/**
 * Fetch TTS audio with character-level timing data. Returns { blob, alignment }.
 * Uses a separate cache prefix so timestamps responses are cached independently.
 */
export async function textToSpeechWithTimestamps(text, apiKey, opts = {}) {
  const { vid, spd, lang } = normalizeOpts(opts);
  const url = cacheUrl('ts:', vid, spd, lang, text);

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    const data = await cached.json();
    return { blob: base64ToBlob(data.audio_base64), alignment: data.alignment };
  }

  const res = await fetchTTS(
    `${API_BASE}/text-to-speech/${vid}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
    apiKey, buildRequestBody(text, lang, spd, opts),
  );

  const data = await res.json();
  await cache.put(url, new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  }));

  return { blob: base64ToBlob(data.audio_base64), alignment: data.alignment };
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
