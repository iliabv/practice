let audioCtx = null;
let currentAudio = null;
let currentUrl = null;

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
 * Play an audio Blob. Returns a Promise that resolves when playback ends.
 * Uses HTMLAudioElement with blob URL for reliable cross-platform playback
 * (AudioContext.decodeAudioData fails on iOS with MediaRecorder's audio/mp4).
 */
export async function playBlob(blob) {
  stopPlayback();

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  currentUrl = url;

  return new Promise((resolve) => {
    const cleanup = () => {
      if (currentAudio === audio) {
        URL.revokeObjectURL(url);
        currentAudio = null;
        currentUrl = null;
      }
      resolve();
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    audio.preload = 'auto';
    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      audio.play();
    } else {
      audio.oncanplaythrough = () => audio.play();
    }
  });
}

/**
 * Stop any currently playing audio.
 * The Promise from playBlob will resolve via onended.
 */
export function stopPlayback() {
  if (currentAudio) {
    currentAudio.oncanplaythrough = null;
    currentAudio.pause();
    // Dispatch 'ended' so the playBlob promise resolves and callers can clean up
    currentAudio.dispatchEvent(new Event('ended'));
  }
}
