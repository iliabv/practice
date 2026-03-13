const CACHE_NAME = 'gemini-tts-cache';

// TODO: remove after migration — clean up old caches
caches.delete('tts-cache');
caches.delete('google-tts-cache');
caches.delete('google-tts-voices');

export const VOICES = [
  'Kore', 'Puck', 'Charon', 'Fenrir', 'Leda',
  'Orus', 'Zephyr', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina',
  'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird',
  'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

export const MODELS = [
  { value: 'gemini-2.5-flash-preview-tts', label: 'Flash' },
  { value: 'gemini-2.5-pro-preview-tts', label: 'Pro' },
];

export const SPEEDS = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
  { value: 'street', label: 'Street' },
  { value: 'drunk', label: 'Drunk' },
];

const SPEED_PROMPTS = {
  slow: 'Read the following slowly and clearly:\n',
  normal: '',
  fast: 'Read the following at a fast pace:\n',
  street: 'Read the following like a casual person on the street — natural, relaxed, sometimes slurring words together, dropping sounds, not overly enunciated:\n',
  drunk: 'Read the following as if you are a bit tipsy — slightly slurred, a little unsteady in rhythm, but still understandable:\n',
};

function cacheUrl(model, voiceName, speed, languageCode, text) {
  return `https://tts-cache/${encodeURIComponent(`${model}:${voiceName}:${speed}:${languageCode}:${text}`)}`;
}

function pcmToWavBlob(base64, sampleRate = 24000) {
  const pcm = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Fetch TTS audio via Gemini API. Returns a WAV audio Blob.
 * Results are cached via the Cache API.
 */
export async function textToSpeech(text, apiKey, opts = {}) {
  const {
    voiceName = 'Kore',
    speed = 'normal',
    languageCode = 'nl-NL',
    model = 'gemini-2.5-flash-preview-tts',
  } = opts;
  const url = cacheUrl(model, voiceName, speed, languageCode, text);

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached.blob();

  const prompt = (SPEED_PROMPTS[speed] || '') + text;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            languageCode: languageCode.split('-')[0],
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini TTS API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData) throw new Error('No audio data in Gemini response');

  const blob = pcmToWavBlob(inlineData.data, 24000);
  await cache.put(url, new Response(blob));
  return blob;
}

/** Languages supported (also used by translation API). */
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
