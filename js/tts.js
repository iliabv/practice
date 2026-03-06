const API_BASE = 'https://texttospeech.googleapis.com';
const CACHE_NAME = 'google-tts-cache';
const AUDIO_ENCODING = 'MP3';

// Clean up old ElevenLabs cache
caches.delete('tts-cache');

function cacheUrl(prefix, voiceName, speed, languageCode, text) {
  return `https://tts-cache/${encodeURIComponent(`${prefix}${voiceName}:${speed}:${languageCode}:${text}`)}`;
}

function base64ToBlob(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: 'audio/mpeg' });
}

/**
 * Fetch TTS audio for the given text. Returns an MP3 audio Blob.
 * Results are cached via the Cache API — persists across page reloads.
 */
export async function textToSpeech(text, apiKey, opts = {}) {
  const { voiceName = '', speed = 1.0, languageCode = 'nl-NL' } = opts;
  const url = cacheUrl('', voiceName, speed, languageCode, text);

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached.blob();

  const res = await fetch(`${API_BASE}/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: languageCode.toLowerCase(), name: voiceName },
      audioConfig: { audioEncoding: AUDIO_ENCODING, speakingRate: speed },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google TTS API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const blob = base64ToBlob(data.audioContent);
  await cache.put(url, new Response(blob));
  return blob;
}

/**
 * Fetch TTS audio for multiple sentences joined together.
 * Returns { blob, timepoints: [] } — Chirp 3 HD doesn't support SSML mark
 * timepoints, so sentence timing uses the character-count fallback in main.js.
 */
export async function textToSpeechWithTimestamps(sentences, apiKey, opts = {}) {
  const fullText = sentences.join(' ');
  const blob = await textToSpeech(fullText, apiKey, opts);
  return { blob, timepoints: [] };
}

const VOICES_CACHE_NAME = 'google-tts-voices';

/**
 * Fetch available Chirp 3 HD voices for a language.
 * Returns array of { name, label }.
 * Cached persistently via Cache API.
 */
export async function fetchVoices(apiKey, languageCode) {
  const cacheKey = `https://tts-voices/${encodeURIComponent(languageCode)}`;
  const cache = await caches.open(VOICES_CACHE_NAME);
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const url = `${API_BASE}/v1/voices?languageCode=${encodeURIComponent(languageCode)}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google TTS voices API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const voices = (data.voices || [])
    .filter(v => /Chirp3-HD/i.test(v.name))
    .map(v => ({
      name: v.name,
      label: v.name.replace(/.*Chirp3-HD-/i, ''),
    }));

  await cache.put(cacheKey, new Response(JSON.stringify(voices), {
    headers: { 'Content-Type': 'application/json' },
  }));
  return voices;
}

/** Languages supported by Chirp 3 HD voices. */
export const LANGUAGES = [
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'en-AU', name: 'English (AU)' },
  { code: 'en-IN', name: 'English (IN)' },
  { code: 'ar-XA', name: 'Arabic' },
  { code: 'bn-IN', name: 'Bengali' },
  { code: 'cmn-CN', name: 'Chinese (Mandarin)' },
  { code: 'fr-FR', name: 'French (FR)' },
  { code: 'fr-CA', name: 'French (CA)' },
  { code: 'de-DE', name: 'German' },
  { code: 'gu-IN', name: 'Gujarati' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'id-ID', name: 'Indonesian' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'kn-IN', name: 'Kannada' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'mr-IN', name: 'Marathi' },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'pt-BR', name: 'Portuguese (BR)' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'es-ES', name: 'Spanish (ES)' },
  { code: 'es-US', name: 'Spanish (US)' },
  { code: 'sw-KE', name: 'Swahili' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' },
  { code: 'th-TH', name: 'Thai' },
  { code: 'tr-TR', name: 'Turkish' },
  { code: 'vi-VN', name: 'Vietnamese' },
];
