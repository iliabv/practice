const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah
const MODEL_ID = 'eleven_multilingual_v2';
const API_BASE = 'https://api.elevenlabs.io/v1';

/** In-memory TTS cache: sentence text → audio Blob */
const cache = new Map();

/**
 * Fetch TTS audio for the given text. Returns an audio Blob.
 * Results are cached in memory — each unique text hits the API only once.
 */
export async function textToSpeech(text, apiKey) {
  if (cache.has(text)) return cache.get(text);

  const res = await fetch(`${API_BASE}/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs API error ${res.status}: ${body}`);
  }

  const blob = await res.blob();
  cache.set(text, blob);
  return blob;
}
