let audioCtx = null;
let currentSource = null;

/**
 * Lazily create and return the shared AudioContext.
 * Resumes automatically if suspended (e.g. before user gesture).
 */
export async function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  return audioCtx;
}

/** Synchronous access to the AudioContext (caller handles resume). */
export function getAudioContextSync() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/**
 * Decode an audio Blob into an AudioBuffer using the Web Audio API.
 * This pre-decodes the entire clip into PCM, eliminating streaming glitches.
 */
async function decodeBlob(blob) {
  const ctx = await getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Play an audio Blob. Returns a Promise that resolves when playback ends.
 * Uses Web Audio API (AudioBufferSourceNode) for glitch-free playback.
 */
export async function playBlob(blob) {
  const ctx = await getAudioContext();

  const buffer = await decodeBlob(blob);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  currentSource = source;

  return new Promise((resolve) => {
    source.onended = () => {
      if (currentSource === source) currentSource = null;
      resolve();
    };
    source.start();
  });
}

/**
 * Stop any currently playing audio.
 * The Promise from playBlob will resolve via onended.
 */
export function stopPlayback() {
  if (currentSource) {
    currentSource.stop();
    currentSource = null;
  }
}
